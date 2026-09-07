"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { rescoreLibrary, setStarred } from "@/features/content/service";

export async function toggleStarredAction(form: FormData) {
  setStarred(db, String(form.get("id")), String(form.get("starred")) === "1");
  revalidatePath("/conteudo");
  revalidatePath(`/conteudo/${String(form.get("id"))}`);
}

export async function rescoreLibraryAction() {
  rescoreLibrary(db);
  revalidatePath("/conteudo");
}
