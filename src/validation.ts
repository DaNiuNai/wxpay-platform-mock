import type { ContractField, Data } from './types.js'
import { fail } from './core.js'

function validateValue(
  value: unknown,
  field: ContractField,
  location: string,
): void {
  const name = `${location}.${field.name}`
  if (value === undefined || value === null) {
    if (field.required) fail(400, 'PARAM_ERROR', `${name} 必填`)
    return
  }
  const string = /^string(?:\((\d+)\))?$/.exec(field.type)
  if (string) {
    if (typeof value !== 'string' || (field.required && !value))
      fail(400, 'PARAM_ERROR', `${name} 必须是非空字符串`)
    if (string[1] && (value as string).length > Number(string[1]))
      fail(400, 'PARAM_ERROR', `${name} 超过最大长度 ${string[1]}`)
  } else if (/^(integer|int64|int32)/.test(field.type)) {
    const numeric =
      location === 'body'
        ? value
        : typeof value === 'string' && /^-?\d+$/.test(value)
          ? Number(value)
          : NaN
    if (!Number.isSafeInteger(numeric))
      fail(400, 'PARAM_ERROR', `${name} 必须是安全整数`)
  } else if (field.type === 'boolean' && typeof value !== 'boolean')
    fail(400, 'PARAM_ERROR', `${name} 必须是布尔值`)
  else if (/^array(?:\[([^\]]+)\])?$/.test(field.type)) {
    if (!Array.isArray(value)) fail(400, 'PARAM_ERROR', `${name} 必须是数组`)
    const elementType = /^array\[([^\]]+)\]$/.exec(field.type)?.[1]
    if (elementType)
      for (const [index, element] of (value as unknown[]).entries()) {
        const primitive = /^(string|integer|int32|int64|boolean)$/.test(
          elementType,
        )
        validateValue(
          element,
          {
            name: `${field.name}[${index}]`,
            type: primitive ? elementType : 'object',
            required: true,
          },
          location,
        )
      }
  } else if (
    field.type === 'object' &&
    (typeof value !== 'object' || Array.isArray(value))
  )
    fail(400, 'PARAM_ERROR', `${name} 必须是对象`)
}

export function validateFields(
  data: Data,
  fields: ContractField[],
  location: string,
  decrypt?: (value: string) => string,
): void {
  for (const field of fields) {
    const parts = field.name.split('.')
    let parents: unknown[] = [data]
    for (const part of parts.slice(0, -1)) {
      parents = parents.flatMap((parent) => {
        if (!parent || typeof parent !== 'object') return []
        const value = (parent as Data)[part]
        return Array.isArray(value)
          ? value
          : value === undefined || value === null
            ? []
            : [value]
      })
    }
    for (const parent of parents) {
      if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
        const value = (parent as Data)[parts.at(-1)!]
        validateValue(
          field.sensitive && decrypt && typeof value === 'string'
            ? decrypt(value)
            : value,
          field,
          location,
        )
      }
    }
  }
}
