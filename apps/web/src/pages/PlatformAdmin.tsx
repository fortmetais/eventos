import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users } from "lucide-react";

import { useRemote } from "../lib/hooks";

import { OrganizationForm } from "../components/OrganizationForm";

import type { Organization, Page } from "../lib/types";

import {
  Empty,
  Loading,
  Notice,
  OrganizationAvatar,
  PageHeading,
} from "../components/ui";

export function PlatformAdmin() {
  const state = useRemote<Page<Organization>>(
    "/admin/organizations?pageSize=100",
  );
  const [editing, setEditing] = useState(false);
  const [editingOrganization, setEditingOrganization] =
    useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="wide-shell">
      <PageHeading
        eyebrow="ADMINISTRAÇÃO DA PLATAFORMA"
        title="Organizações e paróquias"
        action={
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              setEditingOrganization(null);
              setEditing(true);
            }}
          >
            <Plus size={17} />
            Nova organização
          </button>
        }
      >
        Cadastre uma comunidade e convide seu primeiro organizador.
      </PageHeading>
      {editing && (
        <OrganizationForm
          key={editingOrganization?.id ?? "new"}
          organization={editingOrganization}
          onBusyChange={setBusy}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setEditingOrganization(null);
            state.refresh();
          }}
        />
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <Notice>{state.error}</Notice>
      ) : state.data?.items.length ? (
        <div className="org-admin-grid">
          {state.data.items.map((o) => (
            <section className="panel" key={o.id}>
              <div className="card-top">
                <OrganizationAvatar organization={o} />
                <div>
                  <h3>{o.name}</h3>
                  <p>
                    {o.city} · {o.state}
                  </p>
                </div>
              </div>
              {o.tradeName && <p>Nome fantasia: {o.tradeName}</p>}
              {o.legalName && <p>Razão social: {o.legalName}</p>}
              {o.cnpj && (
                <p>
                  CNPJ:{" "}
                  {o.cnpj.replace(
                    /^(.{2})(.{3})(.{3})(.{4})(.{2})$/,
                    "$1.$2.$3/$4-$5",
                  )}
                </p>
              )}
              {o.street && (
                <p>
                  {[
                    o.street,
                    o.number,
                    o.complement,
                    o.neighborhood,
                    o.postalCode,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p>
                {o._count?.events ?? 0} eventos · {o._count?.memberships ?? 0}{" "}
                membros · {o.active ? "Ativa" : "Suspensa"}
              </p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEditingOrganization(o);
                  setEditing(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Editar organização
              </button>
              <Link
                className="button outline full"
                to={"/admin/organizacoes/" + o.id + "/membros"}
              >
                Gerir membros e enviar convite <Users size={17} />
              </Link>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="A primeira comunidade começa aqui">
          Cadastre a paróquia e convide o responsável.
        </Empty>
      )}
    </div>
  );
}
