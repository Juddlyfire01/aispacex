import { describe, it, expect } from 'vitest'
import {
  applyXTextStyle,
  replaceSelection,
  toMathematicalBold,
  toMathematicalItalic,
  toPlainAscii,
  wrapSelection,
} from './x-text-format'

describe('toMathematicalBold', () => {
  it('converts ASCII letters and digits', () => {
    expect(toMathematicalBold('Hi 9')).toBe('𝐇𝐢 𝟗')
  })

  it('leaves punctuation and emoji unchanged', () => {
    expect(toMathematicalBold('ok! 👍')).toBe('𝐨𝐤! 👍')
  })
})

describe('toMathematicalItalic', () => {
  it('converts ASCII letters only', () => {
    expect(toMathematicalItalic('Hi 9')).toBe('𝐻𝑖 9')
  })
})

describe('toPlainAscii', () => {
  it('round-trips styled text', () => {
    const bold = toMathematicalBold('Bold')
    expect(toPlainAscii(bold)).toBe('Bold')
    const italic = toMathematicalItalic('Italic')
    expect(toPlainAscii(italic)).toBe('Italic')
  })
})

describe('applyXTextStyle', () => {
  it('applies bold and italic modes', () => {
    expect(applyXTextStyle('x', 'bold')).toBe('𝐱')
    expect(applyXTextStyle('x', 'italic')).toBe('𝑥')
  })
})

describe('selection helpers', () => {
  it('replaces a selection', () => {
    expect(replaceSelection('hello world', 6, 11, 'X')).toEqual({
      value: 'hello X',
      selectionStart: 7,
      selectionEnd: 7,
    })
  })

  it('wraps selected text', () => {
    expect(wrapSelection('tag me', 0, 3, '#')).toEqual({
      value: '#tag me',
      selectionStart: 1,
      selectionEnd: 4,
    })
  })
})
