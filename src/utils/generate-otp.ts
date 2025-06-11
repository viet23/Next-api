export function generateOtp(): string {
  const now = Math.floor(Date.now() / 1000) 
  const randomPart = Math.floor(Math.random() * 1000) 
  const combined = (now % 10000).toString().padStart(4, '0') + randomPart.toString().padStart(3, '0')
  return combined.slice(-6)
}
