"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Pencil, Trash2, X } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn, initials } from "@/lib/utils";

const WHITE_HEX = "#ffffff";

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
      thumbnailUrl?: string;
      ok: true;
    }
  | {
      error?: string;
      ok: false;
    };
type DeleteResponse =
  | {
      ok: true;
    }
  | {
      error?: string;
      ok: false;
    };

const acceptedImageTypes = new Set(["image/webp", "image/jpeg", "image/png"]);
const maxSourceBytes = 12 * 1024 * 1024;
const outputSize = 512;
const thumbnailSize = 192;
const minZoom = 1;
const maxZoom = 3;

type ProfileImageUploaderCopy = Dictionary["imageUploader"];

const defaultUploaderCopy: ProfileImageUploaderCopy = {
  cancel: "Cancel",
  chooseFirst: "Choose a profile image first.",
  choosePhoto: "Choose photo",
  chooseValidThumbnail: "Choose a valid profile thumbnail.",
  closePreview: "Close preview",
  couldNotPrepare: "Could not prepare this image.",
  couldNotRemove: "Could not remove this photo.",
  couldNotSave: "Could not save this image.",
  crop: "Crop profile image",
  croppedTooLarge: "The cropped image is too large.",
  deleteDescription: "This will remove your profile photo from your story.",
  deletePhoto: "Delete photo",
  deleteTitle: "Delete photo?",
  deleting: "Deleting...",
  editPhoto: "Edit profile photo",
  photoAlt: "Profile photo",
  photoSaved: "Photo saved.",
  previewAlt: "Profile photo preview",
  previewDescription: "Larger preview of the current profile photo.",
  previewPhoto: "Preview profile photo",
  previewTitle: "Profile photo preview",
  removePhoto: "Remove photo",
  removingPhoto: "Removing photo",
  replacePhoto: "Replace photo",
  save: "Save",
  submitStoryFirst: "Submit your story before uploading a profile photo.",
  underSize: "Choose an image under 12 MB.",
  useImage: "Use a WEBP, JPG, or PNG image.",
  useThumbnail: "Use a WEBP, JPG, or PNG thumbnail.",
  thumbnailTooLarge: "The thumbnail image is too large.",
  zoom: "Zoom",
  zoomAria: "Zoom profile image",
};

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
  errorMessage: string,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(errorMessage));
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
  copy = defaultUploaderCopy,
  currentImageUrl,
  displayName,
  hasProfile,
  onUploadComplete,
  showSuccessStatus = true,
}: {
  className?: string;
  copy?: ProfileImageUploaderCopy;
  currentImageUrl: string;
  displayName: string;
  hasProfile: boolean;
  onUploadComplete?: (imageUrl: string) => void;
  showSuccessStatus?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    origin: Point;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const router = useRouter();

  const [error, setError] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isImageActionMenuOpen, setIsImageActionMenuOpen] = useState(false);
  const [isImageRemoved, setIsImageRemoved] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
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
    if (!hasProfile || isUploading || isRemoving) return;
    setIsDeleteConfirmOpen(false);
    setIsImageActionMenuOpen(false);
    fileInputRef.current?.click();
  }

  function clearSelection() {
    setError("");
    setNaturalSize(null);
    setOffset({ x: 0, y: 0 });
    setOk(false);
    setSelectedUrl("");
    setIsDeleteConfirmOpen(false);
    setIsImageActionMenuOpen(false);
    setZoom(1);
  }

  function handlePreviewOpenChange(open: boolean) {
    setIsPreviewOpen(open);
    setIsImageActionMenuOpen(false);

    if (!open) {
      window.requestAnimationFrame(() => previewTriggerRef.current?.blur());
    }
  }

  function handlePreviewCloseAutoFocus(event: Event) {
    event.preventDefault();
    window.requestAnimationFrame(() => previewTriggerRef.current?.blur());
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    setOk(false);
    setIsDeleteConfirmOpen(false);
    setIsImageActionMenuOpen(false);

    if (!file) return;

    if (!acceptedImageTypes.has(file.type)) {
      setError(copy.useImage);
      return;
    }

    if (file.size > maxSourceBytes) {
      setError(copy.underSize);
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

  async function prepareCrop(size = outputSize, quality = 0.9) {
    const image = imageRef.current;
    if (!image || !cropMetrics || !stageSize) {
      throw new Error(copy.chooseFirst);
    }

    const canvas = document.createElement("canvas");
    canvas.height = size;
    canvas.width = size;

    const context = canvas.getContext("2d");
    if (!context) throw new Error(copy.couldNotPrepare);

    context.fillStyle = WHITE_HEX;
    context.fillRect(0, 0, size, size);

    const ratio = size / stageSize;
    context.drawImage(
      image,
      cropMetrics.left * ratio,
      cropMetrics.top * ratio,
      cropMetrics.width * ratio,
      cropMetrics.height * ratio,
    );

    const blob = await canvasToBlob(
      canvas,
      "image/webp",
      quality,
      copy.couldNotPrepare,
    ).catch(() =>
      canvasToBlob(canvas, "image/jpeg", quality, copy.couldNotPrepare),
    );
    return new File([blob], `profile-image-${size}.${extensionForType(blob.type)}`, {
      type: blob.type || "image/jpeg",
    });
  }

  async function uploadImage() {
    setError("");
    setOk(false);
    setIsUploading(true);

    try {
      const [croppedFile, thumbnailFile] = await Promise.all([
        prepareCrop(outputSize, 0.9),
        prepareCrop(thumbnailSize, 0.82),
      ]);
      const formData = new FormData();
      formData.append("image", croppedFile);
      formData.append("thumbnail", thumbnailFile);

      const response = await fetch("/api/profile-image", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as UploadResponse | null;

      if (!payload) {
        throw new Error(copy.couldNotSave);
      }

      if (!payload.ok) {
        throw new Error(payload.error || copy.couldNotSave);
      }

      if (!response.ok) {
        throw new Error(copy.couldNotSave);
      }

      setUploadedImageUrl(payload.imageUrl);
      setIsImageRemoved(false);
      clearSelection();
      setOk(true);
      router.refresh();
      onUploadComplete?.(payload.imageUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : copy.couldNotSave);
    } finally {
      setIsUploading(false);
    }
  }

  function requestRemoveImage() {
    if (!hasProfile || isUploading || isRemoving) return;
    setError("");
    setOk(false);
    setIsImageActionMenuOpen(false);
    setIsDeleteConfirmOpen(true);
  }

  async function removeImage() {
    setError("");
    setOk(false);
    setIsDeleteConfirmOpen(false);
    setIsImageActionMenuOpen(false);
    setIsRemoving(true);

    try {
      const response = await fetch("/api/profile-image", {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as DeleteResponse | null;

      if (!payload) {
        throw new Error(copy.couldNotRemove);
      }

      if (!payload.ok) {
        throw new Error(payload.error || copy.couldNotRemove);
      }

      if (!response.ok) {
        throw new Error(copy.couldNotRemove);
      }

      setUploadedImageUrl("");
      setIsImageRemoved(true);
      clearSelection();
      setOk(true);
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : copy.couldNotRemove);
    } finally {
      setIsRemoving(false);
    }
  }

  const displayInitials = initials(displayName);
  const imageUrl = isImageRemoved ? "" : uploadedImageUrl || currentImageUrl;
  const chooseImageLabel = imageUrl ? copy.replacePhoto : copy.choosePhoto;
  const isBusy = isUploading || isRemoving;

  function renderExistingImageActions() {
    return (
      <>
        <Button
          aria-label={isRemoving ? copy.removingPhoto : copy.removePhoto}
          className="h-9 w-9 rounded-full p-0 text-lipstick-red hover:bg-lipstick-red hover:text-white"
          disabled={!hasProfile || isBusy}
          onClick={requestRemoveImage}
          title={copy.removePhoto}
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <span className="h-6 w-px bg-wine-burgundy/15" aria-hidden="true" />
        <Button
          aria-label={chooseImageLabel}
          className="h-9 w-9 rounded-full p-0 text-wine-burgundy hover:bg-ocean-blue/10"
          disabled={!hasProfile || isBusy}
          onClick={chooseImage}
          title={chooseImageLabel}
          type="button"
          variant="ghost"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
      </>
    );
  }

  function renderMobileImageActions() {
    return (
      <div className="absolute inset-0 z-30 grid grid-cols-2 overflow-hidden bg-wine-burgundy/18 backdrop-blur-[1px] sm:hidden">
        <button
          aria-label={isRemoving ? copy.removingPhoto : copy.removePhoto}
          className="flex items-start justify-center border-r border-white/70 bg-white/55 pt-[28%] text-lipstick-red transition hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/45 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasProfile || isBusy}
          onClick={requestRemoveImage}
          type="button"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 shadow-lg">
            <Trash2 className="h-5 w-5" />
          </span>
        </button>
        <button
          aria-label={chooseImageLabel}
          className="flex items-start justify-center bg-white/55 pt-[28%] text-wine-burgundy transition hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasProfile || isBusy}
          onClick={chooseImage}
          type="button"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 shadow-lg">
            <ImagePlus className="h-5 w-5" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3", className)}>
      <input
        accept="image/webp,image/jpeg,image/png"
        className="sr-only"
        disabled={!hasProfile || isBusy}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      {selectedUrl ? (
        <div
          aria-label={copy.crop}
          className={cn(
            "relative aspect-square w-full touch-none overflow-hidden rounded-xl border-2 border-lipstick-red/70 bg-cement-gray shadow-inner",
            isBusy ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
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
        <Dialog.Root open={isPreviewOpen} onOpenChange={handlePreviewOpenChange}>
          <div className="group relative aspect-square overflow-hidden rounded-xl border-2 border-lipstick-red/70 bg-cement-gray shadow-inner">
            <Dialog.Trigger asChild>
              <button
                aria-label={copy.previewPhoto}
                className="absolute inset-0 cursor-zoom-in border-0 bg-transparent p-0"
                ref={previewTriggerRef}
                type="button"
              >
                <img
                  alt={copy.photoAlt}
                  className="h-full w-full object-cover"
                  loading="eager"
                  src={imageUrl}
                />
              </button>
            </Dialog.Trigger>
            <button
              aria-label={copy.editPhoto}
              aria-expanded={isImageActionMenuOpen}
              className="absolute bottom-2 right-2 z-40 grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/95 text-wine-burgundy shadow-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/35 sm:hidden"
              disabled={!hasProfile || isBusy}
              onClick={() =>
                setIsImageActionMenuOpen((current) => !current)
              }
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {isImageActionMenuOpen ? renderMobileImageActions() : null}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 hidden items-end justify-center bg-wine-burgundy/0 p-3 opacity-0 transition-[background-color,opacity] duration-150 sm:flex sm:group-hover:bg-wine-burgundy/20 sm:group-hover:opacity-100 sm:group-focus-within:bg-wine-burgundy/20 sm:group-focus-within:opacity-100",
                isPreviewOpen &&
                  "sm:group-hover:bg-wine-burgundy/0 sm:group-hover:opacity-0 sm:group-focus-within:bg-wine-burgundy/0 sm:group-focus-within:opacity-0",
              )}
            >
              <div
                className={cn(
                  "pointer-events-auto flex min-w-[7.25rem] items-center justify-center gap-3 rounded-full bg-white/95 px-2 py-1 shadow-lg",
                  isPreviewOpen && "pointer-events-none",
                )}
              >
                {renderExistingImageActions()}
              </div>
            </div>
          </div>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/45 backdrop-blur-sm" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-50 aspect-square w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border-2 border-lipstick-red/70 bg-cement-gray shadow-2xl"
              onCloseAutoFocus={handlePreviewCloseAutoFocus}
            >
              <Dialog.Title className="sr-only">
                {copy.previewTitle}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {copy.previewDescription}
              </Dialog.Description>
              <img
                alt={copy.previewAlt}
                className="h-full w-full object-cover"
                src={imageUrl}
              />
              <Dialog.Close asChild>
                <Button
                  aria-label={copy.closePreview}
                  className="absolute right-3 top-3 h-9 w-9 rounded-full bg-white/95 p-0 text-wine-burgundy shadow-sm hover:bg-white"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <button
          aria-label={chooseImageLabel}
          className="group relative grid aspect-square place-items-center overflow-hidden rounded-xl border-2 border-lipstick-red/70 bg-cement-gray p-0 text-left shadow-inner disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasProfile || isBusy}
          onClick={chooseImage}
          title={chooseImageLabel}
          type="button"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(229,58,62,0.18),transparent_32%),linear-gradient(135deg,rgba(229,58,62,0.12),rgba(38,66,107,0.10))]" />
          <span className="absolute inset-0 grid place-items-center bg-white/80 text-5xl font-extrabold uppercase text-wine-burgundy">
            {displayInitials}
          </span>
          <span className="absolute inset-0 z-20 flex items-end justify-center bg-wine-burgundy/0 p-3 opacity-100 transition-colors duration-150 sm:group-hover:bg-wine-burgundy/12 sm:group-focus-within:bg-wine-burgundy/12">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/95 p-0 text-wine-burgundy shadow-[0_8px_22px_rgba(68,10,18,0.20)] transition-[background-color,border-color,color,transform] duration-150 group-hover:-translate-y-0.5 hover:border-lipstick-red/45 hover:bg-lipstick-red hover:text-white group-focus-visible:-translate-y-0.5">
              <Camera className="h-4 w-4" />
            </span>
          </span>
        </button>
      )}

      {selectedUrl ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="profile-image-zoom">{copy.zoom}</Label>
            <input
              aria-label={copy.zoomAria}
              className="h-2 w-full accent-lipstick-red"
              disabled={isBusy}
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
          <div className="flex flex-nowrap items-center justify-center gap-2">
            <Button
              className="whitespace-nowrap bg-lipstick-red px-5 text-white hover:bg-lipstick-red/90"
              disabled={isBusy || !cropMetrics}
              onClick={uploadImage}
              type="button"
            >
              {copy.save}
            </Button>
            <Button
              className="whitespace-nowrap px-4"
              disabled={isBusy}
              onClick={clearSelection}
              type="button"
              variant="ghost"
            >
              {copy.cancel}
            </Button>
          </div>
        </>
      ) : null}

      {!hasProfile ? (
        <p className="text-sm font-semibold leading-6 text-muted">
          {copy.submitStoryFirst}
        </p>
      ) : null}
      <Dialog.Root
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!isRemoving) setIsDeleteConfirmOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/45 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-5 shadow-2xl">
            <div className="grid gap-2">
              <Dialog.Title className="font-display text-2xl font-extrabold text-wine-burgundy">
                {copy.deleteTitle}
              </Dialog.Title>
              <Dialog.Description className="text-sm font-medium leading-6 text-muted">
                {copy.deleteDescription}
              </Dialog.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild>
                <Button
                  disabled={isRemoving}
                  type="button"
                  variant="ghost"
                >
                  {copy.cancel}
                </Button>
              </Dialog.Close>
              <Button
                className="bg-lipstick-red text-white hover:bg-lipstick-red/90"
                disabled={isRemoving}
                onClick={removeImage}
                type="button"
              >
                {isRemoving ? copy.deleting : copy.deletePhoto}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ActionStatus
        error={error}
        ok={showSuccessStatus && ok}
        successMessage={copy.photoSaved}
        toastKey={error || uploadedImageUrl || ok}
      />
    </div>
  );
}
