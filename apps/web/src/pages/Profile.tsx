import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Heart, CalendarDays } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import type { OwnRegistration, Profile as ProfileData } from "../lib/types";
import { date } from "../lib/types";
import {
  Badge,
  Empty,
  Field,
  Loading,
  Notice,
  PageHeading,
} from "../components/ui";
import { PhotoPicker } from "../components/PhotoPicker";
export function Profile() {
  const auth = useAuth();
  const profile = useRemote<{
    id: string;
    email: string;
    profile: ProfileData;
  }>("/me/profile");
  const registrations = useRemote<OwnRegistration[]>("/me/registrations");
  const [values, setValues] = useState<ProfileData>({ name: "" });
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile.data) {
      setValues(profile.data.profile);
      if (profile.data.profile.photoAssetId)
        void api<{ url: string }>(
          `/me/photos/${profile.data.profile.photoAssetId}`,
        )
          .then((r) => setPhoto(r.url))
          .catch(() => {});
    }
  }, [profile.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/me/profile", { method: "PUT", body: values });
      profile.refresh();
      await auth.refresh();
      setEditing(false);
      setInfo("Perfil atualizado. As fichas anteriores foram preservadas.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-shell">
      <PageHeading
        eyebrow="MINHA CAMINHADA"
        title={
          values.name
            ? `Olá, ${values.name.split(" ")[0]}.`
            : "Seu próximo capítulo começa aqui"
        }
        action={
          <button
            className="button outline"
            onClick={() => setEditing((v) => !v)}
          >
            Editar meu perfil
          </button>
        }
      >
        Suas experiências, seu serviço e os encontros que fazem parte da sua
        história.
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {profile.error && <Notice>{profile.error}</Notice>}
      {editing ? (
        <form className="panel" onSubmit={save}>
          <h2>Meu perfil</h2>
          {(auth.eventsEnabled || auth.volunteerRegistrationsReady) && (
            <PhotoPicker
              endpoint="/me/photo"
              currentUrl={photo}
              onUploaded={(id, url) => {
                setValues((v) => ({ ...v, photoAssetId: id }));
                setPhoto(url);
              }}
            />
          )}
          <div className="form-grid">
            <Field label="Nome completo" required>
              <input
                required
                minLength={2}
                value={values.name ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, name: e.target.value }))
                }
              />
            </Field>
            <Field label="Telefone">
              <input
                type="tel"
                value={values.phone ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, phone: e.target.value }))
                }
              />
            </Field>
            <Field label="Nascimento">
              <input
                type="date"
                value={values.birthDate ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, birthDate: e.target.value }))
                }
              />
            </Field>
            <Field label="Cidade">
              <input
                value={values.city ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, city: e.target.value }))
                }
              />
            </Field>
          </div>
          <p className="muted">E-mail verificado: {profile.data?.email}</p>
          <button className="button primary" disabled={busy}>
            Salvar perfil
          </button>
        </form>
      ) : (
        photo && (
          <div className="profile-intro">
            <img src={photo} alt="Sua foto de perfil" />
            <div>
              <h2>{values.name}</h2>
              <p>{profile.data?.email}</p>
            </div>
          </div>
        )
      )}
      <div className="section-heading">
        <h2>
          Meus encontros <Heart size={19} />
        </h2>
      </div>
      {registrations.loading ? (
        <Loading />
      ) : registrations.error ? (
        <Notice>{registrations.error}</Notice>
      ) : registrations.data?.length ? (
        <div className="history-list">
          {registrations.data.map((r) => (
            <section className="panel history-card" key={r.id}>
              <div className="history-icon">
                <CalendarDays size={25} />
              </div>
              <div>
                <span className="eyebrow">
                  {r.campaign.kind === "CAMPER" ? "CAMPISTA" : "SERVO"}
                  {r.team ? ` · ${r.team.name}` : ""}
                </span>
                <h3>{r.campaign.event.name}</h3>
                <p>{r.campaign.event.organization.name}</p>
                <p>
                  {date(r.campaign.event.startsAt)} até{" "}
                  {date(r.campaign.event.endsAt)}
                </p>
                <small>{r.protocol}</small>
              </div>
              <Badge status={r.status} />
            </section>
          ))}
        </div>
      ) : (
        <Empty title="Sua história está começando">
          Depois de enviar uma inscrição, use “Vincular ao meu perfil” na
          confirmação. <Link to="/">Encontrar um evento →</Link>
        </Empty>
      )}
      <p className="muted">
        Participações antigas são vinculadas individualmente por comprovação ou
        revisão da organização.
      </p>
    </div>
  );
}
