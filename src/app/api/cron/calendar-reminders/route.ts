import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReminderEvent = {
  id: string
  company_id: string
  calendar_id: string
  title: string
  description: string | null
  start_at: string
  due_at: string | null
  reminder_at: string | null
  repeat_rule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  attachment_links: { url: string; label?: string }[]
  reminder_channels: string[]
  reminder_recipients: { email?: string; whatsapp?: string; telegram_chat_id?: string }
  reminder_attempts: number
  created_by: string
  company_calendars?: { name?: string } | { name?: string }[] | null
}

type ChannelResult = { channel: string; ok: boolean; error?: string }

function eventCalendarName(event: ReminderEvent) {
  const calendar = Array.isArray(event.company_calendars) ? event.company_calendars[0] : event.company_calendars
  return calendar?.name || 'Kalender'
}
function dateText(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
function buildMessage(event: ReminderEvent) {
  const parts = [
    `PENGINGAT: ${event.title}`,
    `Kalender: ${eventCalendarName(event)}`,
    `Waktu: ${dateText(event.start_at)} WIB`,
  ]
  if (event.due_at) parts.push(`Tenggat: ${dateText(event.due_at)} WIB`)
  if (event.description?.trim()) parts.push(`Keterangan: ${event.description.trim()}`)
  if (event.attachment_links?.length) parts.push('', 'Tautan:', ...event.attachment_links.map((item) => item.url))
  return parts.join('\n')
}
async function responseText(response: Response) {
  const body = await response.text()
  if (!response.ok) throw new Error(`Provider merespons HTTP ${response.status}: ${body.slice(0, 500)}`)
  return body
}
function missing(...values: (string | undefined)[]) {
  return values.some((value) => !value?.trim())
}

async function sendWhatsApp(event: ReminderEvent, message: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version = process.env.WHATSAPP_GRAPH_API_VERSION
  const to = event.reminder_recipients?.whatsapp
  if (missing(token, phoneId, version, to)) throw new Error('Konfigurasi WhatsApp belum lengkap (access token, phone number ID, versi Graph API, dan nomor penerima).')
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'id'
  const body: Record<string, unknown> = { messaging_product: 'whatsapp', to: to!.replace(/[^+\d]/g, '').replace(/^\+/, '') }
  if (templateName) {
    // Template WhatsApp yang disetujui perlu memiliki 3 parameter body: judul, waktu, dan keterangan.
    body.type = 'template'
    body.template = {
      name: templateName,
      language: { code: language },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: event.title.slice(0, 1024) },
          { type: 'text', text: dateText(event.start_at) },
          { type: 'text', text: (event.description || 'Tidak ada keterangan').slice(0, 1024) },
        ],
      }],
    }
  } else {
    body.type = 'text'
    body.text = { preview_url: true, body: message.slice(0, 4096) }
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await responseText(response)
}

async function sendTelegram(event: ReminderEvent, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = event.reminder_recipients?.telegram_chat_id
  if (missing(token, chatId)) throw new Error('TELEGRAM_BOT_TOKEN atau Telegram Chat ID penerima belum diatur.')
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
  })
  const body = await response.json().catch(() => ({})) as { ok?: boolean; description?: string }
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram HTTP ${response.status}`)
}

async function gmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (missing(clientId, clientSecret, refreshToken)) throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, dan GMAIL_REFRESH_TOKEN belum diatur.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!, client_secret: clientSecret!, refresh_token: refreshToken!, grant_type: 'refresh_token',
    }),
  })
  const body = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string }
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || 'Gagal memperoleh Gmail access token.')
  return body.access_token
}
async function sendGmail(event: ReminderEvent, message: string) {
  const to = event.reminder_recipients?.email
  const from = process.env.GMAIL_SENDER_EMAIL
  if (missing(to, from)) throw new Error('Alamat penerima atau GMAIL_SENDER_EMAIL belum diatur.')
  const accessToken = await gmailAccessToken()
  const subject = `Pengingat Kalender: ${event.title}`.replace(/[\r\n]/g, ' ')
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message,
  ].join('\r\n')
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
  })
  await responseText(response)
}

async function sendChannel(event: ReminderEvent, channel: string, message: string) {
  if (channel === 'whatsapp') return sendWhatsApp(event, message)
  if (channel === 'telegram') return sendTelegram(event, message)
  if (channel === 'gmail') return sendGmail(event, message)
  throw new Error(`Kanal pengingat tidak dikenal: ${channel}`)
}
function nextDate(value: string, repeatRule: ReminderEvent['repeat_rule']) {
  const date = new Date(value)
  if (repeatRule === 'daily') date.setDate(date.getDate() + 1)
  if (repeatRule === 'weekly') date.setDate(date.getDate() + 7)
  if (repeatRule === 'yearly') date.setFullYear(date.getFullYear() + 1)
  if (repeatRule === 'monthly') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, lastDay))
  }
  return date.toISOString()
}
async function createNextOccurrence(sb: ReturnType<typeof createClient>, event: ReminderEvent) {
  if (event.repeat_rule === 'none' || !event.reminder_at) return
  const shift = (value: string | null) => value ? nextDate(value, event.repeat_rule) : null
  const { error } = await sb.from('company_calendar_events').insert({
    company_id: event.company_id,
    calendar_id: event.calendar_id,
    title: event.title,
    description: event.description,
    start_at: nextDate(event.start_at, event.repeat_rule),
    due_at: shift(event.due_at),
    reminder_at: shift(event.reminder_at),
    repeat_rule: event.repeat_rule,
    attachment_links: event.attachment_links ?? [],
    reminder_channels: event.reminder_channels ?? [],
    reminder_recipients: event.reminder_recipients ?? {},
    reminder_status: 'pending',
    reminder_attempts: 0,
    reminder_sent_at: null,
    reminder_last_error: null,
    created_by: event.created_by,
  })
  if (error) throw new Error(`Pengingat berikutnya tidak dapat dibuat: ${error.message}`)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'CRON_SECRET belum dikonfigurasi.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (missing(supabaseUrl, serviceKey)) {
    return Response.json({ error: 'NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.' }, { status: 503 })
  }
  const sb = createClient(supabaseUrl!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const now = new Date().toISOString()
  const { data, error } = await sb.from('company_calendar_events')
    .select('id, company_id, calendar_id, title, description, start_at, due_at, reminder_at, repeat_rule, attachment_links, reminder_channels, reminder_recipients, reminder_attempts, created_by, company_calendars(name)')
    .eq('reminder_status', 'pending')
    .not('reminder_at', 'is', null)
    .lte('reminder_at', now)
    .order('reminder_at', { ascending: true })
    .limit(50)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const results: { id: string; status: string; channels: ChannelResult[]; error?: string }[] = []
  for (const raw of data ?? []) {
    const event = raw as unknown as ReminderEvent
    const { data: claimed, error: claimError } = await sb.from('company_calendar_events')
      .update({ reminder_status: 'sending', reminder_attempts: (event.reminder_attempts ?? 0) + 1, reminder_last_error: null, updated_at: new Date().toISOString() })
      .eq('id', event.id).eq('reminder_status', 'pending').select('id').maybeSingle()
    if (claimError || !claimed) {
      results.push({ id: event.id, status: 'skipped', channels: [], ...(claimError ? { error: claimError.message } : {}) })
      continue
    }
    const channels = Array.isArray(event.reminder_channels) ? event.reminder_channels : []
    if (!event.reminder_at || channels.length === 0) {
      const message = 'Waktu pengingat atau kanal pengiriman belum dipilih.'
      await sb.from('company_calendar_events').update({ reminder_status: 'not_configured', reminder_last_error: message, updated_at: new Date().toISOString() }).eq('id', event.id)
      results.push({ id: event.id, status: 'not_configured', channels: [], error: message })
      continue
    }
    const message = buildMessage(event)
    const channelResults: ChannelResult[] = []
    for (const channel of channels) {
      try {
        await sendChannel(event, channel, message)
        channelResults.push({ channel, ok: true })
      } catch (e) {
        channelResults.push({ channel, ok: false, error: e instanceof Error ? e.message : 'Pengiriman gagal.' })
      }
    }
    const failed = channelResults.filter((item) => !item.ok)
    if (failed.length) {
      const errorMessage = failed.map((item) => `${item.channel}: ${item.error}`).join('; ').slice(0, 2000)
      const missingConfig = failed.some((item) => /belum diatur|belum lengkap|belum dikonfigurasi/i.test(item.error ?? ''))
      const status = missingConfig ? 'not_configured' : 'failed'
      await sb.from('company_calendar_events').update({ reminder_status: status, reminder_last_error: errorMessage, updated_at: new Date().toISOString() }).eq('id', event.id)
      results.push({ id: event.id, status, channels: channelResults, error: errorMessage })
      continue
    }
    const { error: finishError } = await sb.from('company_calendar_events').update({
      reminder_status: 'sent', reminder_sent_at: new Date().toISOString(), reminder_last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', event.id)
    if (finishError) {
      results.push({ id: event.id, status: 'failed', channels: channelResults, error: finishError.message })
      continue
    }
    try {
      await createNextOccurrence(sb, event)
      results.push({ id: event.id, status: 'sent', channels: channelResults })
    } catch (e) {
      results.push({ id: event.id, status: 'sent_next_occurrence_failed', channels: channelResults, error: e instanceof Error ? e.message : 'Gagal membuat event berulang.' })
    }
  }

  return Response.json({
    processed: results.length,
    sent: results.filter((item) => item.status === 'sent').length,
    results,
  })
}
