/** Intel HEX(arduino-cli 출력) → 플래시 이미지. 데이터(00)와 확장 선형 주소(04) 레코드만 쓴다. */
export function parseIntelHex(text: string, size = 0x8000): Uint8Array {
  const flash = new Uint8Array(size);
  let base = 0;
  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith(":")) throw new SyntaxError(`HEX ${n + 1}행: ':'로 시작해야 한다`);
    const bytes = line
      .slice(1)
      .match(/../g)
      ?.map((h) => Number.parseInt(h, 16));
    if (!bytes || bytes.some(Number.isNaN))
      throw new SyntaxError(`HEX ${n + 1}행: 16진수가 아니다`);
    const [count = 0, hi = 0, lo = 0, type = 0] = bytes;
    const data = bytes.slice(4, 4 + count);
    if (bytes.reduce((a, b) => a + b, 0) % 256 !== 0)
      throw new SyntaxError(`HEX ${n + 1}행: 체크섬 오류`);
    if (type === 0) {
      const addr = base + (hi << 8) + lo;
      if (addr + data.length > size)
        throw new RangeError(`HEX ${n + 1}행: 플래시(${size}B)를 넘는다`);
      flash.set(data, addr);
    } else if (type === 1) break;
    else if (type === 4) base = (((data[0] ?? 0) << 8) | (data[1] ?? 0)) << 16;
  }
  return flash;
}
