/** Типы файла аватара; эти ограничения и размеры ниже — по контракту Go `PUT /users/me/avatar`. */
const AVATAR_TYPES = ['image/jpeg', 'image/png'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const SIDE_MIN = 200;
const SIDE_MAX = 4096;

/** Подсказка под кнопкой смены фото и текст ошибки файла. */
export const AVATAR_RULE = 'JPG или PNG, до 5 МБ, стороны от 200 до 4096 px';

/**
 * Проверяет файл до чтения картинки: тип и размер.
 * @returns true, если файл можно декодировать и проверить стороны
 */
export function isAvatarFile(file: { type: string; size: number }): boolean {
    return AVATAR_TYPES.includes(file.type) && file.size > 0 && file.size <= AVATAR_MAX_BYTES;
}

/**
 * Проверяет стороны картинки, включая границы 200 и 4096 px.
 * @param width ширина в px
 * @param height высота в px
 * @returns true, если стороны подходят
 */
export function isAvatarSize(width: number, height: number): boolean {
    return [width, height].every((side) => side >= SIDE_MIN && side <= SIDE_MAX);
}

/**
 * Полная проверка аватара в браузере: тип, размер и стороны декодированной картинки.
 * Повреждённый файл не декодируется и не подходит.
 * @returns true, если файл можно отправлять
 */
export async function checkAvatar(file: File): Promise<boolean> {
    if (!isAvatarFile(file)) return false;
    try {
        const bitmap = await createImageBitmap(file);
        const ok = isAvatarSize(bitmap.width, bitmap.height);
        bitmap.close();
        return ok;
    } catch {
        return false;
    }
}
