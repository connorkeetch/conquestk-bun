const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let crc = i
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 1) === 1) {
        crc = (crc >>> 1) ^ 0xedb88320
      } else {
        crc >>>= 1
      }
    }
    table[i] = crc >>> 0
  }
  return table
})()

export const crc32 = (data: Uint8Array, seed = 0xffffffff): number => {
  let crc = seed ^ 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i] ?? 0
    const tableValue = CRC_TABLE[(crc ^ byte) & 0xff] ?? 0
    crc = tableValue ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
