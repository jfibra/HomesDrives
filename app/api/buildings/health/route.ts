import { buildingOptionsResponse, handleBuildingApiHealth } from '@/lib/server/building-api'

export const runtime = 'nodejs'

export async function OPTIONS(request: Request) {
  return buildingOptionsResponse(request)
}

export async function GET(request: Request) {
  return handleBuildingApiHealth(request)
}
