export type CurrencyOption = { code: string; name: string; symbol: string }
export type ActiveCurrency = CurrencyOption & { is_default: boolean }\nexport type CompanyCurrency = CurrencyOption & { id: string; company_id: string; is_default: boolean; is_active: boolean }

const FALLBACK_CODES = [
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD',
  'CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD',
  'GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT',
  'LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR',
  'NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD',
  'SSP','STN','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG',
  'XOF','XPF','YER','ZAR','ZMW','ZWL','XDR','XAU','XAG','XPD','XPT','XXX'
]

export function getAllCurrencyOptions(): CurrencyOption[] {
  const intlWithValues = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  let codes: string[] = FALLBACK_CODES
  try {
    if (typeof intlWithValues.supportedValuesOf === 'function') {
      codes = [...new Set([...intlWithValues.supportedValuesOf('currency'), ...FALLBACK_CODES])]
    }
  } catch {
    codes = FALLBACK_CODES
  }
  const names = new Intl.DisplayNames(['id-ID'], { type: 'currency' })
  return [...new Set(codes)]
    .filter((code) => /^[A-Z]{3}$/.test(code))
    .map((code) => {
      let name = code
      let symbol = code
      try { name = names.of(code) ?? code } catch { /* retain code as fallback */ }
      try {
        symbol = new Intl.NumberFormat('id-ID', { style: 'currency', currency: code, maximumFractionDigits: 0 })
          .formatToParts(0).find((part) => part.type === 'currency')?.value ?? code
      } catch { /* retain code as fallback */ }
      if (code === 'XXX') { name = 'Mata uang tidak diketahui'; symbol = 'XXX' }
      return { code, name, symbol }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'id-ID') || a.code.localeCompare(b.code))
}

export function formatCurrency(amount: number, code = 'IDR'): string {
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${code} ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(amount)}`
  }
}
