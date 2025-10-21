import { parseJsonField, parseTags } from '@/utils/tagParser'

describe('tagParser', () => {
  describe('parseTags', () => {
    it('should return an array of strings if input is already an array of strings', () => {
      const tags = ['tag1', 'tag2', 'tag3']
      expect(parseTags(tags)).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('should filter out non-string values from an array', () => {
      const tags = ['tag1', 2, null, 'tag3']
      expect(parseTags(tags)).toEqual(['tag1', 'tag3'])
    })

    it('should parse a JSON string array', () => {
      const tags = '["tag1", "tag2", "tag3"]'
      expect(parseTags(tags)).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('should parse a comma-separated string', () => {
      const tags = 'tag1, tag2, tag3'
      expect(parseTags(tags)).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('should handle a single tag as a string', () => {
      const tags = 'tag1'
      expect(parseTags(tags)).toEqual(['tag1'])
    })

    it('should return an empty array for an empty string', () => {
      const tags = ''
      expect(parseTags(tags)).toEqual([])
    })

    it('should return an empty array for a whitespace string', () => {
      const tags = '   '
      expect(parseTags(tags)).toEqual([])
    })

    it('should return an empty array for null or undefined input', () => {
      expect(parseTags(null)).toEqual([])
      expect(parseTags(undefined)).toEqual([])
    })

    it('should return an empty array for non-string, non-array input', () => {
      expect(parseTags(123)).toEqual([])
      expect(parseTags({ a: 1 })).toEqual([])
    })
  })

  describe('parseJsonField', () => {
    it('should parse a valid JSON string', () => {
      const field = '{"a": 1, "b": "test"}'
      expect(parseJsonField(field, {})).toEqual({ a: 1, b: 'test' })
    })

    it('should return the default value for an invalid JSON string', () => {
      const field = '{"a": 1, "b": "test"'
      expect(parseJsonField(field, { a: 0 })).toEqual({ a: 0 })
    })

    it('should return the object if it is already an object', () => {
      const field = { a: 1, b: 'test' }
      expect(parseJsonField(field, {})).toEqual({ a: 1, b: 'test' })
    })

    it('should return the default value for a non-string, non-object input', () => {
      const field = 123
      expect(parseJsonField(field, { a: 0 })).toEqual({ a: 0 })
    })

    it('should return the default value for null or undefined input', () => {
      expect(parseJsonField(null, { a: 0 })).toEqual({ a: 0 })
      expect(parseJsonField(undefined, { a: 0 })).toEqual({ a: 0 })
    })
  })
})
