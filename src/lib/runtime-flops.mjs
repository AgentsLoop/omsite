export function formatFlops(value) {
  if (!Number.isFinite(value) || value <= 0) return 'not estimated'
  const units = [[1e15, 'PFLOPS'], [1e12, 'TFLOPS'], [1e9, 'GFLOPS'], [1e6, 'MFLOPS'], [1e3, 'KFLOPS'], [1, 'FLOPS']]
  const [scale, unit] = units.find(([scale]) => value >= scale) || units.at(-1)
  return `${Intl.NumberFormat('en', { maximumSignificantDigits: 2 }).format(value / scale)} ${unit}`
}
