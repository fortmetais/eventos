import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { useRemote } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { roleLabels, type OrganizationFunction, type Role } from "../lib/types";
import { Field, Loading, Notice, PageHeading } from "../components/ui";

const profiles: Record<Role, string> = {
  ORGANIZER:
    "Gerencia eventos, funções, membros, convites e decisões de inscrição.",
  SECRETARY:
    "Consulta eventos e acompanha inscrições; não gerencia funções, membros ou convites.",
  HEALTH:
    "Consulta saúde somente nos eventos autorizados individualmente para cada membro.",
};
const blank = {
  name: "",
  description: "",
  role: "SECRETARY" as Role,
  active: true,
};
export function OrganizationFunctions() {
  const { organizationId } = useParams();
  const auth = useAuth();
  const state = useRemote<OrganizationFunction[]>(
    `/organizations/${organizationId}/functions`,
  );
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<OrganizationFunction | null>(null);
  const [values, setValues] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const saving = useRef(false);
  useEffect(() => {
    setEditor(false);
    setEditing(null);
    setValues(blank);
    setError("");
    setSuccess("");
  }, [organizationId]);
  function begin(value?: OrganizationFunction) {
    if (saving.current) return;
    setEditing(value ?? null);
    setValues(
      value
        ? {
            name: value.name,
            description: value.description ?? "",
            role: value.role,
            active: value.active,
          }
        : blank,
    );
    setError("");
    setSuccess("");
    setEditor(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<
        OrganizationFunction & {
          affected?: { members: number; invitations: number };
        }
      >(
        `/organizations/${organizationId}/functions${editing ? "/" + editing.id : ""}`,
        { method: editing ? "PUT" : "POST", body: values },
      );
      setEditor(false);
      setSuccess(
        result.affected &&
          (result.affected.members || result.affected.invitations)
          ? `Função atualizada. Perfil aplicado a ${result.affected.members} membro(s) e ${result.affected.invitations} convite(s) pendente(s). Autorizações de saúde devem ser configuradas individualmente.`
          : "Função salva. As funções ativas ficam disponíveis em Membros e convites.",
      );
      state.refresh();
      await auth.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function deactivate(value: OrganizationFunction) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/organizations/${organizationId}/functions/${value.id}`, {
        method: "DELETE",
      });
      setSuccess(
        "Função inativada. Membros vinculados mantêm o acesso e convites válidos continuam podendo ser aceitos.",
      );
      if (editing?.id === value.id) setEditor(false);
      state.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Funções"
        action={
          <div className="button-row">
            <button
              className="button outline"
              disabled={busy || state.loading}
              onClick={state.refresh}
            >
              <RefreshCw size={17} /> Atualizar funções
            </button>
            <button
              className="button primary"
              disabled={busy || state.loading || Boolean(state.error)}
              onClick={() => begin()}
            >
              <Plus size={17} /> Nova função
            </button>
          </div>
        }
      >
        Cadastre as funções da organização e escolha o perfil de acesso de cada
        uma.
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {success && <Notice kind="success">{success}</Notice>}
      {editor && (
        <form className="panel organization-functions-form" onSubmit={save}>
          <h2>{editing ? "Editar função" : "Nova função"}</h2>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <Field label="Nome da função" required>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={values.name}
                  onChange={(e) =>
                    setValues({ ...values, name: e.target.value })
                  }
                  placeholder="Ex.: Coordenação de inscrições"
                />
              </Field>
              <Field label="Perfil de acesso" required>
                <select
                  value={values.role}
                  onChange={(e) =>
                    setValues({ ...values, role: e.target.value as Role })
                  }
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="muted">{profiles[values.role]}</p>
            <Field label="Descrição (opcional)">
              <textarea
                maxLength={500}
                value={values.description}
                onChange={(e) =>
                  setValues({ ...values, description: e.target.value })
                }
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={values.active}
                onChange={(e) =>
                  setValues({ ...values, active: e.target.checked })
                }
              />{" "}
              Disponível para novos membros e convites
            </label>
            {editing && (
              <Notice kind="info">
                Alterar o perfil atualiza todos os membros vinculados e os
                convites pendentes válidos. As autorizações de saúde serão
                removidas quando o perfil mudar; conceda-as novamente por
                evento, se necessário. A organização precisa manter ao menos um
                organizador ativo.
              </Notice>
            )}
            <div className="button-row">
              <button className="button primary">
                {busy ? "Salvando…" : "Salvar função"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => {
                  setEditor(false);
                  setError("");
                }}
              >
                Cancelar edição
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <Notice>{state.error}</Notice>
      ) : (
        <section className="panel">
          <h2>Funções da organização</h2>
          <p>
            Inativar uma função impede novas atribuições e preserva os vínculos
            e convites existentes.
          </p>
          {state.data?.length ? (
            <div className="table-scroll">
              <table className="organization-functions-table">
                <thead>
                  <tr>
                    <th>Função</th>
                    <th>Perfil de acesso</th>
                    <th>Vínculos</th>
                    <th>Disponibilidade</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.data.map((value) => (
                    <tr key={value.id}>
                      <td data-label="Função">
                        <strong>{value.name}</strong>
                        {value.description && (
                          <p className="muted">{value.description}</p>
                        )}
                      </td>
                      <td data-label="Perfil de acesso">
                        {roleLabels[value.role]}
                      </td>
                      <td data-label="Vínculos">
                        {value._count?.members ?? 0}{" "}
                        {value._count?.members === 1 ? "membro" : "membros"} ·{" "}
                        {value._count?.invitations ?? 0}{" "}
                        {value._count?.invitations === 1
                          ? "convite pendente"
                          : "convites pendentes"}
                      </td>
                      <td data-label="Disponibilidade">
                        <span className="badge neutral">
                          {value.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td data-label="Ações">
                        <div className="button-row">
                          <button
                            className="text-button"
                            aria-label={`Editar ${value.name}`}
                            disabled={busy}
                            onClick={() => begin(value)}
                          >
                            Editar
                          </button>
                          {value.active && (
                            <button
                              className="text-button danger"
                              aria-label={`Inativar ${value.name}`}
                              disabled={busy}
                              onClick={() => void deactivate(value)}
                            >
                              Inativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhuma função cadastrada.</p>
          )}
        </section>
      )}
      <Link
        className="button outline"
        to={
          auth.access?.account.platformAdmin
            ? `/admin/organizacoes/${organizationId}/membros`
            : `/organizacao/${organizationId}/membros`
        }
      >
        Membros e convites
      </Link>
    </>
  );
}
