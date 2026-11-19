import { useUnsavedChanges } from "../lib/unsaved-changes";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Plus, Eye } from "lucide-react";

import { api } from "../lib/api";
import type { Campaign, FormConfig, Question } from "../lib/types";
import { Field, Notice } from "./ui";
import { FormLayoutEditor } from "./FormLayoutEditor";
import { FormLayoutPreview } from "./RegistrationFields";
import {
  FormBannerEditor,
  formBannerBody,
  useBannerPreview,
} from "./FormBannerEditor";
import { editableLayout, syncLegacyFlags } from "@fac/form-layout";

const defaultTerms =
  "Declaro que as informações prestadas são verdadeiras e autorizo seu uso pela organização para analisar a inscrição, identificar participantes e organizar os cuidados necessários durante este evento. A participação depende da aprovação da organização. O uso de imagem é opcional e deve seguir as orientações informadas pela organização.";

export function FormVersionEditor({
  campaign,
  organizationId,
  onSaved,
}: {
  campaign: Campaign;
  organizationId: string;
  onSaved: () => void;
}) {
  const [editor, setEditor] = useState(false);
  const [preview, setPreview] = useState(false);
  const [values, setValues] = useState<FormConfig>({
    askCpf: false,
    askAddress: false,
    askShirt: true,
    questions: [],
    terms: defaultTerms,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publish, setPublish] = useState(true);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const bannerPreview = useBannerPreview(bannerFile, values.banner?.url);
  const formDraft = JSON.stringify({ values, publish });
  const formBaseline = useRef(formDraft);
  useEffect(() => {
    formBaseline.current = formDraft;
  }, [editor]);
  const { run: discardForm } = useUnsavedChanges(
    editor && (formDraft !== formBaseline.current || Boolean(bannerFile)),
    { busy },
  );
  const latest = campaign.forms?.[0];
  const configured = syncLegacyFlags({
    ...values,
    layout: editableLayout(values, campaign.kind),
  });
  function begin() {
    setBannerFile(null);
    setValues(
      latest
        ? structuredClone(latest.config)
        : {
            askCpf: false,
            askAddress: false,
            askShirt: true,
            questions: [],
            terms: defaultTerms,
          },
    );
    setEditor(true);
  }
  function question(index: number, patch: Partial<Question>) {
    setValues((v) => ({
      ...v,
      questions: v.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ),
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string }>(
        `/organizations/${organizationId}/campaigns/${campaign.id}/forms`,
        { method: "POST", body: formBannerBody(configured, bannerFile) },
      );
      if (publish)
        await api(
          `/organizations/${organizationId}/campaigns/${campaign.id}/forms/${created.id}/publish`,
          { method: "POST" },
        );
      setEditor(false);
      setBannerFile(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publishExisting() {
    setBusy(true);
    try {
      await api(
        `/organizations/${organizationId}/campaigns/${campaign.id}/forms/${latest!.id}/publish`,
        { method: "POST" },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-builder">
      <hr />
      <div className="list-row">
        <div>
          <h3>Ficha de inscrição</h3>
          <p>
            {latest
              ? `Versão ${latest.version} · ${latest.publishedAt ? "Publicada" : "Rascunho"}`
              : "Nenhuma versão criada"}
          </p>
        </div>
        {!editor && (
          <button className="button outline" onClick={begin}>
            {latest ? "Criar nova versão" : "Configurar ficha"}
          </button>
        )}
      </div>
      {error && <Notice>{error}</Notice>}
      {latest && !latest.publishedAt && !editor && (
        <button
          className="button primary"
          onClick={() => void publishExisting()}
          disabled={busy}
        >
          Publicar esta versão
        </button>
      )}
      {editor && (
        <form onSubmit={save}>
          <FormBannerEditor
            previewUrl={bannerPreview}
            onFile={setBannerFile}
            onRemove={() =>
              setValues((current) => ({ ...current, banner: null }))
            }
            disabled={busy}
          />
          <p className="muted">
            Organize os campos da inscrição por etapa. Novas versões preservam
            as respostas antigas.
          </p>
          <h4>Perguntas adicionais</h4>
          <p className="muted">
            Use esta seção para perguntas do evento. Informações médicas devem
            ficar no bloco de saúde.
          </p>
          {values.questions.map((q, i) => (
            <div className="question-editor" key={q.id}>
              <Field label={`Pergunta ${i + 1}`} required>
                <input
                  required
                  minLength={3}
                  value={q.label}
                  onChange={(e) => question(i, { label: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label="Tipo">
                  <select
                    value={q.type}
                    onChange={(e) =>
                      question(i, { type: e.target.value as Question["type"] })
                    }
                  >
                    {Object.entries({
                      text: "Texto",
                      number: "Número",
                      date: "Data",
                      boolean: "Sim / Não",
                      single: "Escolha única",
                      multiple: "Múltipla escolha",
                    }).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      question(i, { required: e.target.checked })
                    }
                  />
                  Obrigatória
                </label>
              </div>
              {["single", "multiple"].includes(q.type) && (
                <Field label="Opções (uma por linha)">
                  <textarea
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      question(i, { options: e.target.value.split("\n") })
                    }
                  />
                </Field>
              )}
              <div className="button-row">
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      questions: v.questions.filter((_, j) => j !== i),
                    }))
                  }
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button outline"
            disabled={values.questions.length >= 30}
            onClick={() =>
              setValues((v) => ({
                ...v,
                questions: [
                  ...v.questions,
                  {
                    id: `q_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                    label: "",
                    type: "text",
                    required: false,
                    options: [],
                  },
                ],
              }))
            }
          >
            <Plus size={16} />
            Adicionar pergunta
          </button>
          <Field
            label="Termos da campanha"
            required
            hint="Revise o texto com os responsáveis da organização antes de publicar."
          >
            <textarea
              required
              minLength={20}
              rows={5}
              value={values.terms}
              onChange={(e) =>
                setValues((v) => ({ ...v, terms: e.target.value }))
              }
            />
          </Field>
          <FormLayoutEditor
            form={configured}
            kind={campaign.kind}
            onChange={setValues}
            disabled={busy}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Publicar esta versão ao salvar
          </label>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Salvar nova versão
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setPreview((v) => !v)}
            >
              <Eye size={16} />
              Prévia
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void discardForm(() => setEditor(false))}
            >
              Fechar
            </button>
          </div>
          {preview && (
            <FormLayoutPreview
              form={configured}
              kind={campaign.kind}
              bannerPreview={bannerPreview}
            />
          )}
        </form>
      )}
    </div>
  );
}
