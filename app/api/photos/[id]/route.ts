import { NextResponse } from 'next/server'

import {
  createSupabaseAdminClient,
  deleteImageObject,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabaseAdmin = createSupabaseAdminClient()
    const { data: photo, error: selectError } = await supabaseAdmin
      .from('albums_photos')
      .select('id, bucket_name, storage_path')
      .eq('id', id)
      .single()

    if (selectError || !photo) {
      return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
    }

    await deleteImageObject(photo.bucket_name, photo.storage_path)

    const { error: deleteError } = await supabaseAdmin
      .from('albums_photos')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to delete the photo right now.',
      },
      { status: 500 },
    )
  }
}