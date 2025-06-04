// const fetch = require('node-fetch');
const cron = require("node-cron")
const { google } = require("googleapis")
const path = require("path")

// CONFIGURAÇÕES
const SPREADSHEET_ID = "1Gai1vsDPny12oD8W8f2FY5blPYbuAyx_OMNAWcMv3Qc" // <-- SUBSTITUA
const CREDENTIALS_PATH = path.join(__dirname, "service.json")
const BASE_URL = "https://www.descobre.app:443"

// Agendado para rodar às 23:50 todos os dias
// cron.schedule("50 23 * * *", async () => {

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getAnaly() {
  try {
    const today = new Date()
    const dateFormatted = today.toLocaleDateString("pt-BR") // dd/mm/yyyy
    const dateSheets = new Date().toLocaleDateString("pt-BR") // dd/mm/yyyy
    today.setDate(today.getDate() - 1)
    const dateStr = today.toISOString().split("T")[0] // yyyy-mm-dd

    // Autenticação Google
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })
    const client = await auth.getClient()
    const sheets = google.sheets({ version: "v4", auth: client })

    // Obter vídeos
    const listaRes = await fetch(`${BASE_URL}/lista-vturb`)
    const listaData = await listaRes.json()

    for (const video of listaData) {
      const { id_video: playerId, nome: playerName, pitch, oferta } = video

      const pitchTime = convertTimeToSeconds(pitch)

      try {
        // Requisição /analytics
        const analyticsRes = await fetch(`${BASE_URL}/analytics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: `${dateStr} 00:00:01`,
            end_date: `${dateStr} 23:59:59`,
            player_id: playerId,
            field: "country",
            video_duration: 3600,
            timezone: "America/Sao_Paulo",
            pitch_time: pitchTime,
          }),
        })

        const analytics = await analyticsRes.json()

        const {
          views,
          start,
          checkout,
          total_finished,
          conversao,
          pitch_taxa,
        } = analytics

        // Requisição /rates_early
        const earlyRes = await fetch(`${BASE_URL}/rates_early`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: dateStr,
            end_date: dateStr,
            player_id: playerId,
          }),
        })

        const early = await earlyRes.json()

        const lead1min = (100 - (early.lead_1min_rate || 0)).toFixed(2) + "%"
        const lead2min = (100 - (early.lead_2min_rate || 0)).toFixed(2) + "%"

        // Enviar para Google Sheets
        const row = [
          playerId,
          playerName,
          dateSheets,
          pitch_taxa,
          lead1min,
          lead2min,
          start,
          total_finished,
          views,
          conversao,
          checkout,
          oferta,
        ]

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: "A1",
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          resource: {
            values: [row],
          },
        })

        console.log(`✅ Enviado: ${playerName} (${playerId})`)
        await delay(2000)
      } catch (error) {
        console.log("Sem dados da VSL " + video.nome)

        continue
      }
    }

    console.log(
      `🎯 Finalizado para ${listaData.length} vídeos em ${dateFormatted}`
    )
  } catch (err) {
    console.error("❌ Erro geral:", err.message)
  }
}
cron.schedule("1 0 * * *", async () => {
  getAnaly()
})

// Função auxiliar para converter HH:MM:SS em segundos
function convertTimeToSeconds(hms) {
  const [h, m, s] = hms.split(":").map(Number)
  return h * 3600 + m * 60 + s
}
