import type { LinkPreview } from '../../store/chatSlice'

interface LinkPreviewProps {
  preview: LinkPreview
  isOwnMessage?: boolean
}

export default function LinkPreviewComponent({ preview, isOwnMessage = false }: LinkPreviewProps) {
  const hostname = new URL(preview.url).hostname

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 rounded-lg overflow-hidden block transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary ${
        isOwnMessage ? 'bg-primary' : 'bg-surface-1'
      }`}
      title={preview.title ?? hostname}
    >
      {preview.image && (
        <div className="w-full h-40 overflow-hidden">
          <img
            src={preview.image}
            alt={preview.title || 'Link preview'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Hide image if it fails to load
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        </div>
      )}

      <div className="p-3">
        {preview.title && (
          <h4
            className={`font-semibold text-sm mb-1 line-clamp-2 ${
              isOwnMessage ? 'text-white' : 'text-gray-200'
            }`}
          >
            {preview.title}
          </h4>
        )}

        {preview.description && (
          <p
            className={`text-xs line-clamp-2 mb-2 ${isOwnMessage ? 'text-blue-100' : 'text-muted'}`}
          >
            {preview.description}
          </p>
        )}

        <div
          className={`flex items-center gap-1 text-xs ${
            isOwnMessage ? 'text-blue-200' : 'text-muted'
          }`}
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <title>Open link</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          <span className="truncate">{preview.site_name || hostname}</span>
        </div>
      </div>
    </a>
  )
}
