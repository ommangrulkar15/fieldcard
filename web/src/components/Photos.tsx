import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Dialog } from './ui'
import { ApiError, del, get, getBlob, upload } from '../lib/api'
import { shrinkPhoto } from '../lib/image'
import type { Photo } from '../lib/types'

export const MAX_PHOTOS = 5

/** Fetches one image with the auth header and hands back an object URL. */
function useImageUrl(path: string, size: 'thumb' | 'full') {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoked = false
    let created: string | null = null
    getBlob(path, { size })
      .then((blob) => {
        if (revoked) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => setUrl(null))
    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, size])
  return url
}

function Thumb({ base, photo, onOpen }: { base: string; photo: Photo; onOpen: () => void }) {
  const url = useImageUrl(`${base}/${photo.id}/image`, 'thumb')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open photo"
      className="grid size-24 cursor-pointer place-items-center overflow-hidden rounded-lg border border-line bg-raised md:size-28"
    >
      {url ? <img src={url} alt="Job photo" className="size-full object-cover" /> : <span className="text-xs text-faint">…</span>}
    </button>
  )
}

function Viewer({ base, photo, onClose, onDelete }: { base: string; photo: Photo; onClose: () => void; onDelete?: () => void }) {
  const url = useImageUrl(`${base}/${photo.id}/image`, 'full')
  return (
    <Dialog
      open
      onClose={onClose}
      title="Photo"
      footer={
        onDelete && (
          <Button variant="danger" onClick={onDelete}>
            Delete photo
          </Button>
        )
      }
    >
      {url ? <img src={url} alt="Job photo, full size" className="mx-auto max-h-[60dvh] w-full object-contain" /> : <p className="text-muted">Loading…</p>}
    </Dialog>
  )
}

/** Gallery plus add button for a saved job. `canEdit` controls upload and delete. */
export function PhotoGallery({ workspaceId, jobId, canEdit }: { workspaceId: string; jobId: string; canEdit: boolean }) {
  const base = `/workspaces/${workspaceId}/jobs/${jobId}/photos`
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Photo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const photos = useQuery({ queryKey: ['photos', jobId], queryFn: () => get<Photo[]>(base) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['photos', jobId] })

  const add = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await upload<Photo>(base, await shrinkPhoto(file), 'photo.webp')
    },
    onSuccess: () => {
      setError(null)
      void refresh()
    },
    onError: (e) => {
      setError(e instanceof ApiError ? (e.errors.file ?? e.message) : (e as Error).message)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (photo: Photo) => del(`${base}/${photo.id}`),
    onSuccess: () => {
      setOpen(null)
      void refresh()
    },
    onError: (e) => setError((e as ApiError).message),
  })

  const list = photos.data ?? []
  const room = MAX_PHOTOS - list.length
  return (
    <div>
      {error && (
        <div className="mb-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {list.map((photo) => (
          <Thumb key={photo.id} base={base} photo={photo} onOpen={() => setOpen(photo)} />
        ))}
        {canEdit && room > 0 && (
          <button
            type="button"
            disabled={add.isPending}
            onClick={() => input.current?.click()}
            className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-control text-sm font-medium text-muted hover:bg-raised md:size-28"
          >
            {add.isPending ? 'Uploading…' : '+ Add photo'}
          </button>
        )}
      </div>
      {list.length === 0 && !canEdit && <p className="text-muted">No photos.</p>}
      <p className="mt-2 text-xs text-muted">
        {list.length} of {MAX_PHOTOS} photos. Photos are only visible inside the app.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).slice(0, room)
          event.target.value = ''
          if (files.length) add.mutate(files)
        }}
      />
      {open && (
        <Viewer
          base={base}
          photo={open}
          onClose={() => setOpen(null)}
          onDelete={canEdit ? () => window.confirm('Delete this photo?') && remove.mutate(open) : undefined}
        />
      )}
    </div>
  )
}

/** Photos chosen on the entry form before the job exists; uploaded right after it is saved. */
export function PhotoQueue({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const made = files.map((file) => URL.createObjectURL(file))
    setUrls(made)
    return () => made.forEach((url) => URL.revokeObjectURL(url))
  }, [files])
  const room = MAX_PHOTOS - files.length
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <div key={`${file.name}-${index}`} className="relative size-24 md:size-28">
            {urls[index] && <img src={urls[index]} alt={`Selected photo ${index + 1}`} className="size-full rounded-lg border border-line object-cover" />}
            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => onChange(files.filter((_, i) => i !== index))}
              className="absolute -right-2 -top-2 grid size-8 cursor-pointer place-items-center rounded-full bg-primary text-white"
            >
              ×
            </button>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-control text-sm font-medium text-muted hover:bg-raised md:size-28"
          >
            + Add photo
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Up to {MAX_PHOTOS}. They upload when you save the job card.</p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? [])
          event.target.value = ''
          onChange([...files, ...picked].slice(0, MAX_PHOTOS))
        }}
      />
    </div>
  )
}
