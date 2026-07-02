import {
  buildingOptionsResponse,
  handleGetBuilding,
  handleUpdateBuilding,
} from '@/lib/server/building-api'

export const runtime = 'nodejs'
export const maxDuration = 600

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function OPTIONS(request: Request) {
  return buildingOptionsResponse(request)
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params
  return handleGetBuilding(request, id)
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  return handleUpdateBuilding(request, id)
}
