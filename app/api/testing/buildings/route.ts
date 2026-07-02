import {
  buildingOptionsResponse,
  handleListBuildings,
  handleRegisterBuilding,
} from '@/lib/server/building-api'

export const runtime = 'nodejs'
export const maxDuration = 600

export async function OPTIONS(request: Request) {
  return buildingOptionsResponse(request)
}

export async function GET(request: Request) {
  return handleListBuildings(request)
}

export async function POST(request: Request) {
  return handleRegisterBuilding(request)
}
