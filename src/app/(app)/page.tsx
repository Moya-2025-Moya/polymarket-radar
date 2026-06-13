import { redirect } from "next/navigation";

// Read-only dashboard lands on the Polymarket smart-money digest.
export default function Home() {
  redirect("/polymarket/overview");
}
