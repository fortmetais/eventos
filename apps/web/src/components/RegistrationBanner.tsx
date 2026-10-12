import type { FormConfig } from "../lib/types";
export function RegistrationBanner({
  banner,
  previewUrl,
  eventName,
}: {
  banner?: FormConfig["banner"];
  previewUrl?: string;
  eventName?: string;
}) {
  const url = previewUrl ?? banner?.url;
  if (!url) return null;
  return (
    <div className="registration-banner">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ampliar banner do evento"
      >
        <img
          src={url}
          width={banner?.width ?? 1600}
          height={banner?.height ?? 400}
          alt={eventName ? `Banner do evento ${eventName}` : "Banner do evento"}
        />
      </a>
    </div>
  );
}
