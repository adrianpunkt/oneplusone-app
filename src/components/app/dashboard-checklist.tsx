"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ProfileImageUploader } from "@/components/forms/profile-image-uploader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export type DashboardChecklistStep = {
  action?: "profileImage";
  checked: boolean;
  description: string;
  href: string;
  title: string;
};

type DashboardProfileImage = {
  currentImageUrl: string;
  displayName: string;
  hasProfile: boolean;
};

type DashboardChecklistProps = {
  profileImage: DashboardProfileImage;
  steps: DashboardChecklistStep[];
};

const stepClassName =
  "grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-wine/10 bg-white p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-lipstick/25 hover:bg-blush hover:shadow-[0_18px_45px_rgba(68,10,18,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick/30 focus-visible:ring-offset-2";

function StepContent({ step }: { step: DashboardChecklistStep }) {
  return (
    <>
      <Image
        src="/success-checkmark-transparent.webp"
        alt=""
        width={40}
        height={40}
        aria-hidden="true"
        className={`h-10 w-10 shrink-0 object-contain transition duration-150 ${
          step.checked ? "" : "grayscale opacity-30"
        }`}
      />
      <span className="grid gap-1">
        <span className="text-base font-extrabold leading-6 text-wine">
          {step.title}
        </span>
        <span className="text-sm font-medium leading-5 text-muted">
          {step.description}
        </span>
      </span>
      <span className="sr-only">
        {step.checked ? "Complete" : "Incomplete"}
      </span>
    </>
  );
}

function ProfileImageStep({
  profileImage,
  step,
}: {
  profileImage: DashboardProfileImage;
  step: DashboardChecklistStep;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { showToast } = useToast();

  function handleUploadComplete() {
    setIsOpen(false);
    showToast({
      id: "dashboard-profile-photo-saved",
      title: "Photo saved.",
      variant: "success",
    });
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <button className={stepClassName} type="button">
          <StepContent step={step} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-wine/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-2rem),30rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-lg border border-wine/10 bg-white p-5 shadow-2xl">
          <div className="grid gap-1 pr-10">
            <Dialog.Title className="font-display text-2xl font-extrabold text-wine">
              Upload a photo
            </Dialog.Title>
            <Dialog.Description className="text-sm font-medium leading-5 text-muted">
              {step.description}
            </Dialog.Description>
          </div>
          <ProfileImageUploader
            className="mx-auto w-full max-w-[18rem]"
            currentImageUrl={profileImage.currentImageUrl}
            displayName={profileImage.displayName}
            hasProfile={profileImage.hasProfile}
            onUploadComplete={handleUploadComplete}
            showSuccessStatus={false}
          />
          <Dialog.Close asChild>
            <Button
              aria-label="Close photo uploader"
              className="absolute right-3 top-3 h-9 w-9 rounded-full p-0 text-muted hover:bg-blush hover:text-wine"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DashboardChecklist({
  profileImage,
  steps,
}: DashboardChecklistProps) {
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {steps.map((step) => (
        <li key={step.title}>
          {step.action === "profileImage" ? (
            <ProfileImageStep profileImage={profileImage} step={step} />
          ) : (
            <Link href={step.href} className={stepClassName}>
              <StepContent step={step} />
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}
