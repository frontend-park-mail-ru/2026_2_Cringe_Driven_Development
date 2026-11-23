const ESCAPES: Record<string, string> = {
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
};

/**
 * JSON для тела `<script type="application/json">` в HTML. Данные сериализует `JSON.stringify`,
 * затем `<`, `>`, `&`, U+2028 и U+2029 во всём результате, включая ключи, заменяются JSON escapes:
 * `</script>` и `<!--` не закрывают элемент, а `JSON.parse` возвращает исходные значения.
 * Не HTML-санитайзер, не экранирование атрибутов и URL и не проверка состава данных.
 * @param value JSON-данные
 * @returns строка JSON для вставки в тело script как HTML
 * @throws {TypeError} значение не сериализуется: цикл, BigInt, корневые `undefined`, функция,
 *   символ. Сообщение фиксированное, без входных данных
 */
export function serializeJsonForHtml(value: unknown): string {
    let json: string | undefined;
    try {
        json = JSON.stringify(value);
    } catch {
        // без cause: в тексте исходной ошибки бывают имена ключей
        throw new TypeError('Значение нельзя сериализовать в JSON');
    }
    if (json === undefined) throw new TypeError('Корневое значение не сериализуется в JSON');
    return json.replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c] ?? c);
}
