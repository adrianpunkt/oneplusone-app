"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, RotateCcw, Upload, X } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn, initials } from "@/lib/utils";

type Point = {
  x: number;
  y: number;
};

type ImageSize = {
  height: number;
  width: number;
};

type UploadResponse =
  | {
      imageUrl: string;
      ok: true;
    }
  | {
      error?: string;
      ok: false;
    };

const acceptedImageTypes = new Set(["image/webp", "image/jpeg", "image/png"]);
const maxSourceBytes = 12 * 1024 * 1024;
const outputSize = 512;
const minZoom = 1;
const maxZoom = 3;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not prepare this image."));
      },
      type,
      quality,
    );
  });
}

function extensionForType(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
}

export function ProfileImageUploader({
  className,
  currentImageUrl,
  displayName,
  hasProfile,
}: {
  className?: string;
  currentImageUrl: string;
  displayName: string;
  hasProfile: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    origin: Point;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const router = useRouter();

  const [error, setError] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [naturalSize, setNaturalSize] = useState<ImageSize | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [ok, setOk] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [stageSize, setStageSize] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function updateStageSize() {
      setStageSize(stage?.getBoundingClientRect().width || 0);
    }

    updateStageSize();
    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(stage);
    return () => resizeObserver.disconnect();
  }, [selectedUrl]);

  useEffect(() => {
    return () => {
      if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    };
  }, [selectedUrl]);

  const clampOffset = useCallback(
    (candidate: Point, nextZoom = zoom) => {
      if (!naturalSize || !stageSize) return { x: 0, y: 0 };

      const baseScale = Math.max(stageSize / naturalSize.width, stageSize / naturalSize.height);
      const scaledWidth = naturalSize.width * baseScale * nextZoom;
      const scaledHeight = naturalSize.height * baseScale * nextZoom;
      const maxX = Math.max(0, (scaledWidth - stageSize) / 2);
      const maxY = Math.max(0, (scaledHeight - stageSize) / 2);

      return {
        x: Math.min(maxX, Math.max(-maxX, candidate.x)),
        y: Math.min(maxY, Math.max(-maxY, candidate.y)),
      };
    },
    [naturalSize, stageSize, zoom],
  );

  const cropMetrics = useMemo(() => {
    if (!naturalSize || !stageSize) return null;

    const clampedOffset = clampOffset(offset);
    const baseScale = Math.max(stageSize / naturalSize.width, stageSize / naturalSize.height);
    const scale = baseScale * zoom;
    const width = naturalSize.width * scale;
    const height = naturalSize.height * scale;

    return {
      height,
      left: (stageSize - width) / 2 + clampedOffset.x,
      top: (stageSize - height) / 2 + clampedOffset.y,
      width,
    };
  }, [clampOffset, naturalSize, offset, stageSize, zoom]);

  function chooseImage() {
    if (!hasProfile || isUploading) return;
    fileInputRef.current?.click();
  }

  function clearSelection() {
    setError("");
    setNaturalSize(null);
    setOffset({ x: 0, y: 0 });
    setOk(false);
    setSelectedUrl("");
    setZoom(1);
  }

  function resetCrop() {
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    setOk(false);

    if (!file) return;

    if (!acceptedImageTypes.has(file.type)) {
      setError("Use a WEBP, JPG, or PNG image.");
      return;
    }

    if (file.size > maxSourceBytes) {
      setError("Choose an image under 12 MB.");
      return;
    }

    setNaturalSize(null);
    setOffset({ x: 0, y: 0 });
    setSelectedUrl(URL.createObjectURL(file));
    setZoom(1);
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    setNaturalSize({
      height: image.naturalHeight,
      width: image.naturalWidth,
    });
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectedUrl || !naturalSize || isUploading) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      origin: offset,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setOffset(
      clampOffset({
        x: drag.origin.x + event.clientX - drag.startX,
        y: drag.origin.y + event.clientY - drag.startY,
      }),
    );
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function prepareCrop() {
    const image = imageRef.current;
    if (!image || !cropMetrics || !stageSize) {
      throw new Error("Choose a profile image first.");
    }

    const canvas = document.createElement("canvas");
    canvas.height = outputSize;
    canvas.width = outputSize;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this image.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputSize, outputSize);

    const ratio = outputSize / stageSize;
    context.drawImage(
      image,
      cropMetrics.left * ratio,
      cropMetrics.top * ratio,
      cropMetrics.width * ratio,
      cropMetrics.height * ratio,
    );

    const blob = await canvasToBlob(canvas, "image/webp", 0.9).catch(() =>
      canvasToBlob(canvas, "image/jpeg", 0.9),
    );
    return new File([blob], `profile-image.${extensionForType(blob.type)}`, {
      type: blob.type || "image/jpeg",
    });
  }

  async function uploadImage() {
    setError("");
    setOk(false);
    setIsUploading(true);

    try {
      const croppedFile = await prepareCrop();
      const formData = new FormData();
      formData.append("image", croppedFile);

      const response = await fetch("/api/profile-image", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as UploadResponse | null;

      if (!payload) {
        throw new Error("Could not save this image.");
      }

      if (!payload.ok) {
        throw new Error(payload.error || "Could not save this image.");
      }

      if (!response.ok) {
        throw new Error("Could not save this image.");
      }

      setUploadedImageUrl(payload.imageUrl);
      clearSelection();
      setOk(true);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not save this image.");
    } finally {
      setIsUploading(false);
    }
  }

  const displayInitials = initials(displayName);
  const imageUrl = uploadedImageUrl || currentImageUrl;
  const chooseImageLabel = imageUrl ? "Replace photo" : "Choose photo";

  return (
    <div className={cn("grid gap-3", className)}>
      <input
        accept="image/webp,image/jpeg,image/png"
        className="sr-only"
        disabled={!hasProfile || isUploading}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      {selectedUrl ? (
        <div
          aria-label="Crop profile image"
          className={cn(
            "relative aspect-square w-full touch-none overflow-hidden rounded-xl border border-wine/10 bg-mist shadow-inner",
            isUploading ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
          )}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          ref={stageRef}
          role="img"
        >
          <img
            alt=""
            className="absolute left-0 top-0 max-w-none select-none"
            draggable={false}
            onLoad={handleImageLoad}
            ref={imageRef}
            src={selectedUrl}
            style={
              cropMetrics
                ? {
                    height: cropMetrics.height,
                    transform: `translate3d(${cropMetrics.left}px, ${cropMetrics.top}px, 0)`,
                    width: cropMetrics.width,
                  }
                : undefined
            }
          />
        </div>
      ) : imageUrl ? (
        <div className="group relative aspect-square overflow-hidden rounded-xl border border-wine/10 bg-mist shadow-inner">
          <img
            alt="Profile photo"
            className="h-full w-full object-cover"
            loading="eager"
            src={imageUrl}
          />
          <div className="absolute inset-0 flex items-end justify-center bg-wine/0 p-3 opacity-100 transition-[background-color,opacity] duration-150 sm:opacity-0 sm:group-hover:bg-wine/20 sm:group-hover:opacity-100 sm:group-focus-within:bg-wine/20 sm:group-focus-within:opacity-100">
            <Button
              className="shadow-lg"
              disabled={!hasProfile || isUploading}
              onClick={chooseImage}
              type="button"
              variant="secondary"
            >
              <ImagePlus className="h-4 w-4" />
              {chooseImageLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="group relative grid aspect-square place-items-center overflow-hidden rounded-xl border border-wine/10 bg-mist shadow-inner">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(229,58,62,0.18),transparent_32%),linear-gradient(135deg,rgba(197,135,50,0.18),rgba(38,66,107,0.10))]" />
          <span className="relative grid h-24 w-24 place-items-center rounded-full border border-white/70 bg-white/80 text-2xl font-black uppercase text-wine shadow-sm">
            {displayInitials}
          </span>
          <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-lipstick shadow-sm">
            <Camera className="h-4 w-4" />
          </span>
          <div className="absolute inset-0 flex items-end justify-center bg-wine/0 p-3 opacity-100 transition-[background-color,opacity] duration-150 sm:opacity-0 sm:group-hover:bg-wine/12 sm:group-hover:opacity-100 sm:group-focus-within:bg-wine/12 sm:group-focus-within:opacity-100">
            <Button
              className="shadow-lg"
              disabled={!hasProfile || isUploading}
              onClick={chooseImage}
              type="button"
              variant="secondary"
            >
              <ImagePlus className="h-4 w-4" />
              {chooseImageLabel}
            </Button>
          </div>
        </div>
      )}

      {selectedUrl ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="profile-image-zoom">Zoom</Label>
            <input
              aria-label="Zoom profile image"
              className="h-2 w-full accent-lipstick"
              disabled={isUploading}
              id="profile-image-zoom"
              max={maxZoom}
              min={minZoom}
              onChange={(event) => {
                const nextZoom = Number(event.target.value);
                setZoom(nextZoom);
                setOffset((current) => clampOffset(current, nextZoom));
              }}
              step="0.01"
              type="range"
              value={zoom}
            />
          </div>
          <div className="grid gap-2">
            <Button
              className="w-full"
              disabled={isUploading || !cropMetrics}
              onClick={uploadImage}
              type="button"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? "Saving..." : "Save photo"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isUploading} onClick={resetCrop} type="button" variant="ghost">
                <RotateCcw className="h-4 w-4" />
                Reset crop
              </Button>
              <Button disabled={isUploading} onClick={clearSelection} type="button" variant="ghost">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {!hasProfile ? (
        <p className="text-sm font-semibold leading-6 text-muted">
          Submit your story before uploading a profile photo.
        </p>
      ) : null}
      <ActionStatus error={error} ok={ok} />
    </div>
  );
}
