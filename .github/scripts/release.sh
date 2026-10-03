#!/usr/bin/env bash
# Выкатка клиента в S3. Раскладка бакета:
#   releases/{sha}/ — сборка клиента, неизменяемая;
#   index.html      — копия index.html текущего релиза, его отдаёт Caddy;
#   current.json    — { "stable": "{sha}", "previous": "{sha}" }, читает только CI.
set -euo pipefail

KEEP_RELEASES=5
IMMUTABLE='public, max-age=31536000, immutable'
HTML='text/html; charset=utf-8'

die() {
    echo "::error::$*" >&2
    exit 1
}

need() {
    local v
    for v in "$@"; do
        [ -n "${!v:-}" ] || die "Не задана переменная $v"
    done
}

check_sha() {
    [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || die "Ожидается sha коммита, получено: '${1:-}'"
}

s3_init() {
    need S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY
    # регион подписи у Selectel — пул из адреса: https://s3.<пул>.storage.selcloud.ru
    local region="${S3_REGION:-}"
    if [ -z "$region" ]; then
        [[ "$S3_ENDPOINT" =~ ^https?://s3\.([^./]+)\. ]] ||
            die "Не удалось взять регион из S3_ENDPOINT, задайте S3_REGION"
        region="${BASH_REMATCH[1]}"
    fi
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
    export AWS_DEFAULT_REGION="$region" AWS_ENDPOINT_URL="$S3_ENDPOINT"
    # S3 Selectel не считает контрольные суммы, которые новые aws cli шлют по умолчанию
    export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
    # адресация path-style, чужие профили и ключи из ~/.aws не подхватываются
    AWS_CONFIG_FILE="$(mktemp)"
    printf '[default]\ns3 =\n    addressing_style = path\n' >"$AWS_CONFIG_FILE"
    export AWS_CONFIG_FILE AWS_SHARED_CREDENTIALS_FILE=/dev/null
}

cdn_url() {
    need CDN_URL
    local url="${CDN_URL%/}"
    [[ "$url" =~ ^https?:// ]] || url="https://$url"
    printf '%s' "$url"
}

# печатает current.json; пустой вывод — файла ещё нет (первый релиз)
read_current() {
    local err
    if err=$(aws s3api head-object --bucket "$S3_BUCKET" --key current.json 2>&1 >/dev/null); then
        aws s3 cp "s3://$S3_BUCKET/current.json" -
    elif ! grep -q '404' <<<"$err"; then
        die "Не удалось прочитать current.json: $err"
    fi
}

# write_current <stable> <previous>; пустой previous записывается как null
write_current() {
    jq -n --arg stable "$1" --arg previous "$2" \
        '{stable: $stable, previous: (if $previous == "" then null else $previous end)}' |
        aws s3 cp - "s3://$S3_BUCKET/current.json" \
            --content-type application/json --cache-control no-cache
}

publish_index() {
    aws s3 cp "s3://$S3_BUCKET/releases/$1/index.html" "s3://$S3_BUCKET/index.html" \
        --metadata-directive REPLACE --content-type "$HTML" --cache-control no-cache
}

output() {
    [ -z "${GITHUB_OUTPUT:-}" ] || echo "$1=$2" >>"$GITHUB_OUTPUT"
}

# upload <sha> [каталог сборки] — dist → releases/{sha}/
upload() {
    local sha="${1:-}" dir="${2:-dist}"
    check_sha "$sha"
    [ -f "$dir/index.html" ] || die "В $dir нет index.html — сборка не выполнена"
    s3_init
    local dest="s3://$S3_BUCKET/releases/$sha/"

    # Content-Type по расширению задаём сами: aws cli берёт его из mime.types раннера,
    # а чанк с чужим типом браузер как модуль не выполнит
    local types=(
        'html|text/html; charset=utf-8'
        'js|text/javascript; charset=utf-8'
        'mjs|text/javascript; charset=utf-8'
        'css|text/css; charset=utf-8'
        'json|application/json'
        'map|application/json'
        'webmanifest|application/manifest+json'
        'txt|text/plain; charset=utf-8'
        'svg|image/svg+xml'
        'png|image/png'
        'jpg|image/jpeg'
        'jpeg|image/jpeg'
        'gif|image/gif'
        'webp|image/webp'
        'avif|image/avif'
        'ico|image/x-icon'
        'woff|font/woff'
        'woff2|font/woff2'
        'ttf|font/ttf'
        'wasm|application/wasm'
    )
    local entry ext rest=()
    for entry in "${types[@]}"; do
        ext="${entry%%|*}"
        rest+=(--exclude "*.$ext")
        aws s3 cp "$dir" "$dest" --recursive --only-show-errors \
            --exclude '*' --include "*.$ext" --exclude index.html \
            --content-type "${entry#*|}" --cache-control "$IMMUTABLE"
    done
    # остальные расширения — с типом, который определит aws cli
    aws s3 cp "$dir" "$dest" --recursive --only-show-errors \
        --exclude index.html "${rest[@]}" --cache-control "$IMMUTABLE"
    # index.html — последним: релиз с index.html загружен целиком
    aws s3 cp "$dir/index.html" "${dest}index.html" --only-show-errors \
        --content-type "$HTML" --cache-control no-cache
    echo "Релиз $sha загружен в $dest"
}

# promote <sha> — сделать релиз текущим
promote() {
    local sha="${1:-}" current stable='' previous=''
    check_sha "$sha"
    s3_init
    current=$(read_current)
    if [ -n "$current" ]; then
        stable=$(jq -r '.stable // ""' <<<"$current")
        previous=$(jq -r '.previous // ""' <<<"$current")
    fi
    # повторная выкатка того же релиза previous не трогает, иначе откатываться будет некуда
    [ "$stable" = "$sha" ] || previous="$stable"
    # сначала index.html, потом указатель: атомарной записи двух объектов в S3 нет,
    # при падении между шагами отстаёт указатель, а не сайт
    publish_index "$sha"
    write_current "$sha" "$previous"
    echo "stable: $sha, previous: ${previous:-null}"
}

# rollback — вернуть релиз previous, stable и previous меняются местами
rollback() {
    local current stable previous
    s3_init
    current=$(read_current)
    [ -n "$current" ] || die "current.json нет — откатываться некуда"
    stable=$(jq -r '.stable // ""' <<<"$current")
    previous=$(jq -r '.previous // ""' <<<"$current")
    [ -n "$previous" ] || die "В current.json нет previous — откатываться некуда"
    check_sha "$previous"
    output sha "$previous"
    publish_index "$previous"
    write_current "$previous" "$stable"
    echo "stable: $previous, previous: $stable"
}

# health <sha> — сайт отдаёт HTML релиза, чанк из него грузится с CDN
health() {
    local sha="${1:-}" site="${SITE_URL:-https://cellestial.ru}" cdn try
    check_sha "$sha"
    site="${site%/}"
    cdn=$(cdn_url)
    for try in $(seq 1 12); do
        if health_once "$sha" "$site" "$cdn"; then
            return 0
        fi
        sleep "${HEALTH_INTERVAL:-5}"
    done
    die "Health check не прошёл: $site не отдаёт релиз $sha"
}

health_once() {
    local sha="${1:-}" site="$2" cdn="$3" html got chunk headers origin
    html=$(curl -fsS --max-time 10 "$site/") || return 1
    got=$(sed -n 's/.*<meta name="release" content="\([^"]*\)".*/\1/p' <<<"$html" | head -n 1)
    if [ "$got" != "$sha" ]; then
        echo "$site/: release='$got', ждём '$sha'"
        return 1
    fi
    chunk=$(grep -o "src=\"$cdn/releases/$sha/[^\"]*\.js\"" <<<"$html" | head -n 1 | cut -d '"' -f 2)
    if [ -z "$chunk" ]; then
        echo "В HTML нет чанка с $cdn/releases/$sha/"
        return 1
    fi
    # чанки подключены как <script type="module" crossorigin>: без CORS браузер их не выполнит
    headers=$(curl -fsS --max-time 10 -o /dev/null -D - -H "Origin: $site" "$chunk") || return 1
    origin=$(tr -d '\r' <<<"$headers" |
        sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: *//p' | tail -n 1)
    if [ "$origin" != '*' ] && [ "$origin" != "$site" ]; then
        echo "$chunk: Access-Control-Allow-Origin='$origin', нужен '$site'"
        return 1
    fi
    echo "OK: $site/ отдаёт релиз $sha, $chunk грузится с CDN"
}

# retention — оставить KEEP_RELEASES последних релизов, stable и previous не удаляются никогда
retention() {
    local current listing sha
    s3_init
    current=$(read_current)
    [ -n "$current" ] || die "current.json нет — без него удалять релизы нельзя"
    listing=$(aws s3api list-objects-v2 --bucket "$S3_BUCKET" --prefix releases/ --output json)
    [ -n "$listing" ] || listing='{}'
    # возраст релиза — время последней записи в его каталог
    jq -r --argjson current "$current" --argjson keep "$KEEP_RELEASES" '
        [(.Contents // [])[] | {sha: (.Key | split("/")[1]), at: .LastModified}]
        | group_by(.sha) | map({sha: .[0].sha, at: (map(.at) | max)})
        | sort_by(.at) | reverse | .[$keep:]
        | map(.sha) - [$current.stable, $current.previous] | .[]
    ' <<<"$listing" | while read -r sha; do
        check_sha "$sha"
        echo "Удаляем релиз $sha"
        aws s3 rm "s3://$S3_BUCKET/releases/$sha/" --recursive --only-show-errors
    done
}

# notify <Выкатка|Откат> <success|failure|cancelled> [sha] — сообщение в Telegram
notify() {
    local what="${1:-}" status="${2:-}" sha="${3:-}" text run
    need TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
    case "$status" in
        success) text="✅ $what фронта: успешно" ;;
        cancelled) text="⚪ $what фронта: отменено" ;;
        *) text="❌ $what фронта: ошибка" ;;
    esac
    [ -z "$sha" ] || text="$text"$'\n'"Релиз <code>$sha</code>"
    [ -z "${GITHUB_ACTOR:-}" ] || text="$text"$'\n'"Запустил: $GITHUB_ACTOR"
    run="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
    jq -n --arg chat "$TELEGRAM_CHAT_ID" --arg topic "${TELEGRAM_TOPIC_ID:-}" \
        --arg text "$text" --arg run "$run" '{
            chat_id: $chat, text: $text, parse_mode: "HTML",
            reply_markup: {inline_keyboard: [[{text: "Запуск", url: $run}]]}
        } + (if $topic == "" then {} else {message_thread_id: ($topic | tonumber)} end)' |
        curl -fsS --max-time 20 -o /dev/null -H 'Content-Type: application/json' -d @- \
            "${TELEGRAM_API:-https://api.telegram.org}/bot$TELEGRAM_BOT_TOKEN/sendMessage" ||
        die "Telegram не принял сообщение"
}

cmd="${1:-}"
[ $# -eq 0 ] || shift
case "$cmd" in
    upload | promote | rollback | health | retention | notify) "$cmd" "$@" ;;
    *) die "Использование: release.sh upload|promote|rollback|health|retention|notify" ;;
esac
