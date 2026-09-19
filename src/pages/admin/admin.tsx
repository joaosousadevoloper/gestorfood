import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Dashboard from "./dashboard";

type Establishment = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  active: boolean;
};

export default function Admin() {
  const [stores, setStores] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
  if (!supabase) {
    console.error("Supabase não está configurado.");
    setLoading(false);
    return;
  }

                  
  const { data, error } = await supabase
    .from("establishments")
    .select("id, name, slug, phone, active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    setLoading(false);
    return;
  }

  setStores(data || []);
  setLoading(false);
}
  if (loading) {
    return <div>Carregando...</div>;
  }

  return (
    <div>
      <h1>Administração</h1>

      <p>Gerenciamento do GestorFood</p>

      <h2>Lojas cadastradas</h2>
      <Dashboard/>

      {stores.map((store) => (
        <div key={store.id}>
          <strong>{store.name}</strong>

          <span>
            {store.active ? "Ativa" : "Suspensa"}
          </span>
        </div>
      ))}
    </div>
  );
}