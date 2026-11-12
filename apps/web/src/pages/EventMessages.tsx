import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganization } from "./Organization";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import type { EventEdition } from "../lib/types";
import { Field, Loading, Notice, PageHeading } from "../components/ui";

type MessageSettings = {
  ready: boolean;
  event: { id: string; name: string };
  revision: number;
  template: string;
  defaultTemplate: string;
  customized: boolean;
  fields: { key: string; label: string; example: string }[];
  previewValues: Record<string, string>;
  requiredFields?: { keys: string[]; label: string }[];
};
const defaultRequiredFields = [
  { keys: ["nome", "primeiro_nome"], label: "Nome do candidato" },
  { keys: ["link"], label: "Link pessoal" },
];
export function EventMessages() {
  const { organizationId, membership } = useOrganization();
  const [params, setParams] = useSearchParams();
  const [eventId, setEventId] = useState(params.get("evento") ?? "");
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  if (membership.role !== "ORGANIZER")
    return (
      <Notice>A personalização de mensagens é restrita ao organizador.</Notice>
    );
  return (
    <>
      <PageHeading title="Mensagens do evento">
        Personalize a mensagem de aceite dos servos e confira como ficará antes
        de compartilhar.
      </PageHeading>
      <section className="panel">
        <Field label="Evento">
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setParams(e.target.value ? { evento: e.target.value } : {}, {
                replace: true,
              });
            }}
          >
            <option value="">Selecione um evento</option>
            {events.data?.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </Field>
        {events.loading && <Loading />}
        {events.error && <Notice>{events.error}</Notice>}
      </section>
      {eventId && (
        <MessageEditor
          key={eventId}
          organizationId={organizationId}
          eventId={eventId}
        />
      )}
    </>
  );
}
function MessageEditor({
  organizationId,
  eventId,
}: {
  organizationId: string;
  eventId: string;
}) {
  const path = `/organizations/${organizationId}/events/${eventId}/accept-message`;
  const remote = useRemote<MessageSettings>(path);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState("");
  const [conflict, setConflict] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (remote.data) setText(remote.data.template);
  }, [remote.data]);
  const data = remote.data;
  if (remote.loading) return <Loading />;
  if (remote.error) return <Notice>{remote.error}</Notice>;
  if (!data) return null;
  const variables = new Set(
    [...text.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((match) => match[1]),
  );
  const missing = (data.requiredFields ?? defaultRequiredFields).filter(
    (field) => !field.keys.some((key) => variables.has(key)),
  );
  const unsaved = text !== data.template;
  function edit(value: string) {
    setText(value);
    setError("");
    setConflict(false);
    setInfo("");
  }
  function completeRequiredFields() {
    let completed = text.trimEnd();
    const lines: Record<string, string> = {
      evento: "Evento: {{evento}}.",
      link: "Confirme sua presença pelo link: {{link}}",
      validade: "Link pessoal válido até {{validade}} (horário de Brasília).",
    };
    for (const field of missing) {
      if (field.keys.includes("nome") || field.keys.includes("primeiro_nome")) {
        const key = field.keys.includes("primeiro_nome")
          ? "primeiro_nome"
          : "nome";
        completed = `Olá, {{${key}}}!\n\n${completed}`;
      } else {
        const key = field.keys[0];
        const line = lines[key] ?? `${field.label}: {{${key}}}.`;
        completed = completed ? `${completed}\n\n${line}` : line;
      }
    }
    return completed;
  }
  const completedText = completeRequiredFields();
  function insert(key: string) {
    const input = editor.current;
    const start = input?.selectionStart ?? text.length,
      end = input?.selectionEnd ?? text.length;
    const variable = `{{${key}}}`;
    edit(text.slice(0, start) + variable + text.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(
        start + variable.length,
        start + variable.length,
      );
    });
  }
  async function save() {
    if (missing.length || busy || !data!.ready || text.length > 5000) return;
    setBusy(true);
    setError("");
    setConflict(false);
    setInfo("");
    try {
      const updated = await api<MessageSettings>(path, {
        method: "PUT",
        body: {
          revision: data!.revision,
          template: text === data!.defaultTemplate ? null : text,
        },
      });
      remote.setData(updated);
      setInfo("Mensagem salva para este evento. Nenhuma mensagem foi enviada.");
    } catch (e) {
      setError((e as Error).message);
      setConflict((e as { status?: number }).status === 409);
    } finally {
      setBusy(false);
    }
  }
  const preview = text.replace(
    /\{\{\s*([\w]+)\s*\}\}/g,
    (original, key: string) => data.previewValues[key] ?? original,
  );
  return (
    <section className="panel">
      <h2>Aceite para servir · {data.event.name}</h2>
      {!data.ready && (
        <Notice>
          A personalização das mensagens aguarda a atualização 17 do banco. Você
          pode consultar o texto padrão.
        </Notice>
      )}
      {error && (
        <Notice>
          {error}{" "}
          {conflict && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError("");
                setConflict(false);
                remote.refresh();
              }}
            >
              Recarregar modelo salvo
            </button>
          )}
        </Notice>
      )}
      {info && <Notice kind="success">{info}</Notice>}
      {unsaved && data.ready && (
        <Notice kind="info">
          Alterações ainda não salvas. Os envios continuam usando o último
          modelo salvo.
        </Notice>
      )}
      <p>
        Use os botões para inserir as informações de cada candidato. O nome
        (completo ou primeiro nome) e o link pessoal são obrigatórios. Evento e
        validade são opcionais: você pode escrever essas informações diretamente
        no texto. O departamento será o efetivamente alocado; sem alocação,
        aparecerá “A definir pela organização”.
      </p>
      {data.ready && missing.length > 0 && (
        <section aria-label="Informações obrigatórias para salvar">
          <Notice kind="info">
            Para salvar, inclua todas as informações automáticas abaixo:
            <ul>
              {missing.map((field) => (
                <li key={field.keys.join("/")}>
                  {field.label}:{" "}
                  <code>
                    {field.keys.map((key) => `{{${key}}}`).join(" ou ")}
                  </code>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button outline"
              disabled={busy || completedText.length > 5000}
              onClick={() => edit(completedText)}
            >
              Adicionar informações obrigatórias
            </button>
            {completedText.length > 5000 && (
              <p>
                Reduza o texto para incluir as informações obrigatórias dentro
                de 5.000 caracteres.
              </p>
            )}
          </Notice>
        </section>
      )}
      <div className="message-editor">
        <div>
          <Field
            label="Texto da mensagem"
            hint="Até 5.000 caracteres. Use texto simples e quebras de linha; o mesmo texto é usado no WhatsApp e no e-mail."
          >
            <textarea
              ref={editor}
              rows={18}
              maxLength={5000}
              value={text}
              disabled={busy || !data.ready}
              onChange={(e) => {
                edit(e.target.value);
              }}
            />
          </Field>
          <small>{text.length}/5.000 caracteres</small>
        </div>
        <section aria-label="Prévia da mensagem">
          <h3 className="message-preview-label">Prévia com dados fictícios</h3>
          <p className="message-preview">{preview}</p>
          <p className="muted">
            Para enviar a mensagem preenchida de um candidato, use o WhatsApp na
            listagem de inscrições.
          </p>
        </section>
      </div>
      <section
        className="message-insertions"
        aria-label="Inserir informações automáticas"
      >
        <h3>Inserção automática</h3>
        <div className="button-row">
          {data.fields.map((field) => (
            <button
              key={field.key}
              type="button"
              className="button outline"
              disabled={busy || !data.ready}
              onClick={() => insert(field.key)}
            >
              Inserir {field.label.toLocaleLowerCase("pt-BR")}
            </button>
          ))}
        </div>
      </section>
      <div className="button-row">
        <button
          className="button primary"
          disabled={
            busy ||
            !data.ready ||
            text === data.template ||
            text.trim().length < 20 ||
            text.length > 5000 ||
            missing.length > 0
          }
          onClick={() => void save()}
        >
          {busy ? "Salvando…" : "Salvar mensagem"}
        </button>
        <button
          className="button outline"
          disabled={busy || !data.ready}
          onClick={() => {
            edit(data.defaultTemplate);
            setInfo(
              "Texto padrão carregado na edição. Salve para aplicar ao evento.",
            );
          }}
        >
          Restaurar texto padrão
        </button>
      </div>
      <p className="muted">
        Salvar o modelo não envia mensagens nem modifica candidaturas. Mensagens
        já enviadas permanecem com o conteúdo original.
      </p>
    </section>
  );
}
