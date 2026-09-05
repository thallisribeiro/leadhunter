import { expect, test } from "@playwright/test";
import path from "node:path";

test("runs the complete local LeadHunter flow with 20 fictitious leads", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-client-ready", "true");
  await page.getByLabel("Nome da empresa").fill("Estúdio Horizonte");
  await page.getByLabel("Descrição do negócio").fill("Agência fictícia de sites para negócios locais.");
  await page.getByLabel("Oferta", { exact: true }).fill("Sites orientados a conversão.");
  await page.getByLabel("Pitch em uma frase").fill("Transformamos visitas em conversas comerciais.");
  await page.getByLabel("Afirmações verificadas").fill("Atendimento em português e inglês");
  await page.getByLabel("Afirmações proibidas").fill("Garantia de aumento de receita");
  await page.getByLabel("Segmentos").fill("odontologia");
  await page.getByLabel("Localizações").fill("Miami, Florida");
  await page.getByLabel("Objetivo").fill("Agendar uma conversa de 15 minutos");
  await page.getByLabel("Chamada para ação").fill("Faz sentido eu enviar duas ideias?");
  await page.getByLabel("Tom").fill("Direto e consultivo");
  await page.getByRole("button", { name: /Salvar e criar campanha/ }).click();
  await page.waitForURL(/\/campaigns\/new$/);

  await page.getByLabel("Nome").fill("Dentistas Miami");
  await page.getByLabel("Objetivo").fill("Encontrar clínicas odontológicas com oportunidade digital.");
  await page.getByLabel("Localizações").fill("Miami, Florida, USA");
  await page.getByLabel("Segmentos").fill("dentist\ndental clinic");
  await page.getByLabel("Palavras-chave").fill("cosmetic dentistry");
  await page.getByLabel("Sinais preferidos").fill("odontologia estética");
  await page.getByLabel("Score mínimo").fill("50");
  await page.getByRole("button", { name: /Criar campanha/ }).click();
  await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/);

  const csvInput = page.locator('input[type="file"][aria-label="Arquivo CSV"]');
  await expect(csvInput).toBeEnabled();
  await csvInput.setInputFiles(path.resolve("tests/fixtures/dental-leads.csv"));
  await expect(page.getByText("Mapeie pelo menos a coluna que contém o nome da empresa.")).toBeVisible();
  await page.getByLabel("Mapear clinic").selectOption("companyName");
  const importResponsePromise = page.waitForResponse((response) => response.url().includes("/api/import/csv") && response.status() === 200);
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const importResponse = await importResponsePromise;
  expect(importResponse.ok(), await importResponse.text()).toBe(true);
  await expect(page.getByText("20 linhas importadas.", { exact: true })).toBeVisible();
  await expect(page.getByText("Encontrados").locator("..").getByText("20", { exact: true })).toBeVisible();
  const campaignUrl = page.url();

  await page.getByRole("button", { name: "Enriquecer pendentes" }).click();
  await page.goto("/jobs");
  await expect.poll(async () => { await page.reload(); return page.getByText("Concluído", { exact: true }).count(); }).toBeGreaterThanOrEqual(20);
  await page.goto(campaignUrl);
  await page.getByRole("button", { name: "Recalcular scores" }).click();
  await page.goto("/jobs");
  await expect.poll(async () => { await page.reload(); return page.getByText("Concluído", { exact: true }).count(); }).toBeGreaterThanOrEqual(40);

  await page.goto(campaignUrl);
  const boxes = page.getByRole("checkbox", { name: /Selecionar/ });
  expect(await boxes.count()).toBe(20);
  for (let index = 0; index < 20; index += 1) await boxes.nth(index).check();
  await page.getByRole("button", { name: "Adicionar à shortlist" }).click();
  const campaignId = new URL(campaignUrl).pathname.split("/").pop()!;
  await page.goto(`/shortlist`);
  const shortlistBoxes = page.getByRole("checkbox", { name: /Selecionar/ });
  for (let index = 0; index < 20; index += 1) await shortlistBoxes.nth(index).check();
  await page.getByRole("button", { name: "Gerar abordagem" }).click();

  await page.goto("/outreach");
  await expect(page.getByText("Revisar", { exact: true })).toHaveCount(20);
  const approveButtons = page.getByRole("button", { name: "Aprovar" });
  for (let remaining = 20; remaining > 0; remaining -= 1) {
    await expect(approveButtons).toHaveCount(remaining);
    await approveButtons.first().click();
    await expect(approveButtons).toHaveCount(remaining - 1);
  }
  await page.goto("/shortlist");
  const dryRunBoxes = page.getByRole("checkbox", { name: /Selecionar/ });
  for (let index = 0; index < 20; index += 1) await dryRunBoxes.nth(index).check();
  await page.getByRole("button", { name: "Dry-run email" }).click();

  const exportResponse = await request.get(`/api/exports/campaigns/${campaignId}`);
  expect(exportResponse.ok()).toBe(true);
  expect(await exportResponse.text()).toContain("Ocean Dental Studio");

  await page.goto("/leads");
  await page.getByRole("link", { name: "Ocean Dental Studio" }).click();
  await page.getByRole("button", { name: "Respondeu" }).click();
  await expect(page.getByText("Respondeu", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "screenshots/e2e-lead-profile.png", fullPage: true });
});
