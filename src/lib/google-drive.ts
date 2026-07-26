import { google } from 'googleapis'

export function createDriveAuth() {
  const keyJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY
  if (!keyJson) return null
  const credentials = JSON.parse(Buffer.from(keyJson, 'base64').toString('utf8'))
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}
