export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  )
}

export function jsonText(value) {
  return JSON.stringify(value, null, 2)
}

export function parseObject(text, name = 'JSON') {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${name} 格式错误，请检查引号、逗号和括号`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} 必须是 JSON 对象`)
  return value
}

export function buildPath(template, parameters = {}, query = {}) {
  const path = template.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = parameters[name]
    if (value === undefined || value === null || String(value).trim() === '')
      throw new Error(`路径参数 ${name} 必填`)
    return encodeURIComponent(String(value))
  })
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('请求路径必须以单个 / 开头')
  const pairs = new URLSearchParams()
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '')
      pairs.set(
        name,
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      )
  }
  const encoded = pairs.toString()
  return `${path}${encoded ? `${path.includes('?') ? '&' : '?'}${encoded}` : ''}`
}

export function setValue(target, path, value) {
  const names = path.split('.')
  if (
    names.some((name) =>
      ['__proto__', 'prototype', 'constructor'].includes(name),
    )
  )
    throw new Error('不支持的字段名')
  let current = target
  for (const name of names.slice(0, -1)) {
    if (!current[name] || typeof current[name] !== 'object') current[name] = {}
    current = current[name]
  }
  current[names.at(-1)] = value
}

export function getValue(target, path) {
  return path.split('.').reduce((value, name) => value?.[name], target)
}

export function leafFields(object, prefix = '') {
  const fields = []
  for (const [name, value] of Object.entries(object ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name
    if (value && typeof value === 'object' && !Array.isArray(value))
      fields.push(...leafFields(value, path))
    else
      fields.push({
        path,
        value,
        type: Array.isArray(value)
          ? 'json'
          : typeof value === 'boolean'
            ? 'checkbox'
            : typeof value === 'number'
              ? 'number'
              : 'text',
      })
  }
  return fields
}

export function tableRows(snapshot, table) {
  return Object.entries(snapshot?.[table] ?? {}).map(([key, value]) => ({
    key,
    value,
  }))
}

export function matchContract(template, path) {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[^}]+\\\}/g, '[^/?]+')
  return new RegExp(`^${escaped}/?(?:\\?.*)?$`).test(path)
}

export function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Windows PowerShell 单引号字符串使用两个单引号表示字面单引号。
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}
