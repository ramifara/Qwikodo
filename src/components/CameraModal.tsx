import { useEffect, useRef, useState } from "react";
import { decodeFrame, type Scan } from "../lib/decode";

/** Milliseconds between decode attempts. Ten looks a second is plenty. */
const INTERVAL = 90;

function cameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access was denied. Allow it in your system privacy settings, then reopen.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera is connected to this computer.";
  if (name === "NotReadableError") return "Another app is using the camera.";
  return err instanceof Error ? err.message : "The camera didn't start.";
}

export function CameraModal({
  onRead,
  onClose,
}: {
  onRead: (scans: Scan[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // Kept in a ref so the capture loop below never restarts the camera.
  const handlers = useRef({ onRead, onClose });
  handlers.current = { onRead, onClose };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handlers.current.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let decoding = false;
    let lastAttempt = 0;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = (time: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!ctx || !video?.videoWidth || decoding || time - lastAttempt < INTERVAL) return;
      lastAttempt = time;
      decoding = true;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0);

      decodeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height))
        .then((scans) => {
          if (stopped || !scans.length) return;
          stopped = true;
          handlers.current.onRead(scans);
        })
        .catch(() => undefined)
        .finally(() => {
          decoding = false;
        });
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        // Cleanup may already have run while this was in flight, in which case
        // it had no stream to stop and the camera would stay on.
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setLive(true);
        raf = requestAnimationFrame(tick);
      } catch (err) {
        if (!stopped) setError(cameraError(err));
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="viewfinder-scrim" role="dialog" aria-modal="true" aria-label="Camera">
      <div className={error ? "viewfinder is-dark" : "viewfinder"}>
        {!error && (
          <>
            <video ref={videoRef} playsInline muted className={live ? "is-live" : ""} />
            <div className="reticle" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          </>
        )}
        <div className="viewfinder-bar">
          <span className={error ? "vf-status is-error" : "vf-status"}>
            {error ?? (live ? "Looking for a code" : "Starting the camera")}
          </span>
          <button className="act" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
