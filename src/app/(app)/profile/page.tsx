import { permanentRedirect } from "next/navigation";

export default function ProfileRedirectPage() {
  permanentRedirect("/my-story");
}
