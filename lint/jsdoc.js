// Свои правила oxlint про JSDoc: в плагине jsdoc самого oxlint нет require-jsdoc и check-param-names.
// Подключается через jsPlugins в oxlint.config.ts, правила — cdd/require-jsdoc и cdd/check-param-names.

/**
 * JSDoc-комментарий прямо перед узлом.
 *
 * @param {object} context контекст правила
 * @param {object} node узел AST
 * @returns {string | null} текст комментария без ограничителей или null, если JSDoc нет
 */
function jsdocBefore(context, node) {
    const comment = context.sourceCode.getCommentsBefore(node).at(-1);
    return comment?.type === 'Block' && comment.value.startsWith('*') ? comment.value : null;
}

/**
 * Имена параметров из тегов `@param`, без вложенных (`props.name`) и в порядке записи.
 *
 * @param {string} jsdoc текст JSDoc-комментария
 * @returns {string[]} имена параметров
 */
function paramTags(jsdoc) {
    const names = [];
    for (const [, rest] of jsdoc.matchAll(/@param\b([^\n]*)/g)) {
        let text = rest.trim();
        if (text.startsWith('{')) {
            // тип может содержать вложенные скобки: {{ id: string }}
            let depth = 0;
            let end = 0;
            for (; end < text.length; end++) {
                if (text[end] === '{') depth++;
                else if (text[end] === '}' && --depth === 0) break;
            }
            text = text.slice(end + 1).trim();
        }
        const name = /^\[?\s*([\w$.]+)/.exec(text)?.[1];
        if (name && !name.includes('.')) names.push(name);
    }
    return names;
}

/**
 * Функция, которую документирует комментарий перед узлом: само объявление либо функция
 * в инициализаторе `const`.
 *
 * @param {object} node объявление после `export` или сам узел
 * @returns {object | null} узел функции или null, если документируется не функция
 */
function documentedFunction(node) {
    const target = node.type.startsWith('Export') ? node.declaration : node;
    if (!target) return null;
    if (target.type === 'FunctionDeclaration') return target;
    if (target.type === 'VariableDeclaration' && target.declarations.length === 1) {
        const init = target.declarations[0].init;
        if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
            return init;
        }
    }
    return null;
}

/**
 * Имя параметра функции, как его ждёт `@param`.
 *
 * @param {object} param узел параметра
 * @returns {string | null} имя или null, если параметр деструктурирован и имя в JSDoc любое
 */
function paramName(param) {
    if (param.type === 'TSParameterProperty') return paramName(param.parameter);
    if (param.type === 'AssignmentPattern') return paramName(param.left);
    if (param.type === 'RestElement') return paramName(param.argument);
    return param.type === 'Identifier' ? param.name : null;
}

const requireJsdoc = {
    meta: {
        type: 'suggestion',
        docs: { description: 'Экспортируемое объявление должно иметь JSDoc' },
        schema: [],
    },
    create(context) {
        const check = (node) => {
            // реэкспорт (`export { a } from './a'`) и `export default <выражение>` — не объявления
            const declaration = node.declaration;
            if (!declaration || !declaration.type.endsWith('Declaration')) return;
            if (jsdocBefore(context, node) !== null) return;
            const id = declaration.id ?? declaration.declarations?.[0]?.id;
            // у перегрузок JSDoc несёт первая сигнатура
            const siblings = node.parent?.body ?? [];
            const previous = siblings[siblings.indexOf(node) - 1]?.declaration;
            if (
                id?.name &&
                previous?.type === 'TSDeclareFunction' &&
                previous.id?.name === id.name
            ) {
                return;
            }
            context.report({
                node: id ?? node,
                message: `У экспорта ${id?.name ? `«${id.name}» ` : ''}нет JSDoc: добавьте комментарий /** … */ перед объявлением`,
            });
        };
        return { ExportNamedDeclaration: check, ExportDefaultDeclaration: check };
    },
};

const checkParamNames = {
    meta: {
        type: 'problem',
        docs: { description: 'Имена в @param совпадают с параметрами функции' },
        schema: [],
    },
    create(context) {
        const check = (node) => {
            const fn = documentedFunction(node);
            const jsdoc = fn && jsdocBefore(context, node);
            if (!jsdoc) return;
            const tags = paramTags(jsdoc);
            const params = fn.params.map(paramName);
            tags.forEach((tag, i) => {
                if (i >= params.length) {
                    context.report({ node: fn, message: `@param «${tag}»: такого параметра нет` });
                } else if (params[i] !== null && params[i] !== tag) {
                    context.report({
                        node: fn,
                        message: `@param «${tag}»: параметр называется «${params[i]}»`,
                    });
                }
            });
        };
        return {
            ExportNamedDeclaration: check,
            ExportDefaultDeclaration: check,
            // необъявленные через export — только сами объявления, иначе узел проверится дважды
            ':not(ExportNamedDeclaration, ExportDefaultDeclaration) > FunctionDeclaration': check,
            ':not(ExportNamedDeclaration) > VariableDeclaration': check,
        };
    },
};

export default {
    meta: { name: 'cdd' },
    rules: {
        'require-jsdoc': requireJsdoc,
        'check-param-names': checkParamNames,
    },
};
