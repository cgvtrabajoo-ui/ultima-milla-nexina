import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function App() {
  const [usuarioActivo, setUsuarioActivo] = useState(null)
  const [choferes, setChoferes] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [historico, setHistorico] = useState([])
  const [notificaciones, setNotificaciones] = useState([])

  useEffect(() => {
    cargarDatos()
  }, [])

async function cargarDatos() {
  const { data: choferesData, error: errorChoferes } =
    await supabase.from('choferes').select('*')

  const { data: pedidosData, error: errorPedidos } =
  await supabase
    .from('pedidos')
    .select('*')
    .eq('archivado', false)
    .order('orden')

  console.log('CHOFERES:', choferesData)
  console.log('ERROR CHOFERES:', errorChoferes)

  console.log('PEDIDOS:', pedidosData)
  console.log('ERROR PEDIDOS:', errorPedidos)

  if (errorChoferes) {
    alert('Error cargando choferes: ' + errorChoferes.message)
  }

  if (errorPedidos) {
    alert('Error cargando pedidos: ' + errorPedidos.message)
  }

  setChoferes(choferesData || [])
  setPedidos(pedidosData || [])
}
async function cargarHistorico() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('archivado', true)
    .order('created_at', { ascending: false })

  if (error) {
    alert('Error cargando histórico: ' + error.message)
    return
  }

  setHistorico(data || [])
}

async function cargarCSV(event) {
  const archivo = event.target.files[0]
  if (!archivo) return

  const lector = new FileReader()

  lector.onload = async function (e) {
    const texto = e.target.result
    const lineas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')

    const encabezado = lineas[0]
    const separador = encabezado.includes(';') ? ';' : ','
    const datos = lineas.slice(1)

    const nuevaRutaId = `RUTA-${Date.now()}`

    const pedidosCargados = datos.map((linea) => {
      const columnas = linea.split(separador)

      return {
        ov: columnas[0]?.trim(),
        cliente: columnas[1]?.trim(),
        direccion: columnas[2]?.trim(),
        telefono: columnas[3]?.trim(),
        chofer_id: Number(columnas[4]?.trim()),
        orden: Number(columnas[5]?.trim()),
        estado: 'pendiente',
        remito_url: null,
        ruta_id: nuevaRutaId,
        archivado: false
      }
    })

    const choferesAfectados = [...new Set(pedidosCargados.map(p => p.chofer_id))]

    const { error: errorArchivado } = await supabase
      .from('pedidos')
      .update({ archivado: true })
      .in('chofer_id', choferesAfectados)
      .eq('archivado', false)

    if (errorArchivado) {
      alert('Error archivando ruta anterior: ' + errorArchivado.message)
      return
    }

    const { error } = await supabase
      .from('pedidos')
      .insert(pedidosCargados)

    if (error) {
      alert('Error cargando pedidos: ' + error.message)
      return
    }

    alert(`Nueva ruta cargada correctamente. Pedidos cargados: ${pedidosCargados.length}`)
    cargarDatos()
  }

  lector.readAsText(archivo, 'UTF-8')
}

  async function iniciarEntrega(id) {
    await supabase.from('pedidos').update({ estado: 'en camino' }).eq('id', id)
    cargarDatos()
  }

async function cargarRemito(id, archivo) {
  if (!archivo) return

  const nombreArchivo = `remito-${id}-${Date.now()}-${archivo.name}`

  const { error: uploadError } = await supabase.storage
    .from('remitos')
    .upload(nombreArchivo, archivo)

  if (uploadError) {
    alert('Error subiendo remito: ' + uploadError.message)
    return
  }

  const { data } = supabase.storage
    .from('remitos')
    .getPublicUrl(nombreArchivo)

  const urlRemito = data.publicUrl

  const { error: updateError } = await supabase
    .from('pedidos')
    .update({ remito_url: urlRemito })
    .eq('id', id)

  if (updateError) {
    alert('Error guardando remito en pedido: ' + updateError.message)
    return
  }

  setPedidos(prev =>
    prev.map(p =>
      p.id === id ? { ...p, remito_url: urlRemito } : p
    )
  )

  alert('Remito cargado correctamente.')
}

async function entregarPedido(id) {
  const { data: pedidoActualizado, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    alert('Error validando pedido: ' + error.message)
    return
  }

  if (!pedidoActualizado.remito_url) {
    alert('Para entregar el pedido, primero tenés que cargar la foto del remito firmado.')
    return
  }

  const { error: updateError } = await supabase
    .from('pedidos')
    .update({ estado: 'entregado' })
    .eq('id', id)

  if (updateError) {
    alert('Error marcando entregado: ' + updateError.message)
    return
  }

  const rutaChofer = pedidos
    .filter(p => p.chofer_id === pedidoActualizado.chofer_id && p.id !== id)
    .sort((a, b) => a.orden - b.orden)

  const siguiente = rutaChofer.find(p => p.estado === 'pendiente')

  if (siguiente) {
    const mensaje = `Hola ${siguiente.cliente}, tu pedido ${siguiente.ov} es el próximo a ser entregado.`
    const telefono = siguiente.telefono.replace(/\D/g, '')
    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`

    window.open(url, '_blank')

    setNotificaciones(prev => [
      ...prev,
      `WhatsApp abierto para ${siguiente.cliente}`
    ])
  }

  await cargarDatos()
}

  

  function vistaAdmin() {
    return (
      <div>
        <h2>Panel Admin / Tráfico</h2>

        <button onClick={() => setUsuarioActivo(null)}>Volver</button>

        <h3>Cargar hoja de ruta</h3>
        <input type="file" accept=".csv" onChange={cargarCSV} />

        <h3>Pedidos cargados: {pedidos.length}</h3>

        {choferes.map(chofer => {
          const ruta = pedidos
            .filter(p => p.chofer_id === chofer.id)
            .sort((a, b) => a.orden - b.orden)

          return (
            <div key={chofer.id} style={{ border: '2px solid black', margin: 15, padding: 15 }}>
              <h3>Ruta de {chofer.nombre}</h3>

              {ruta.length === 0 && <p>Sin pedidos asignados.</p>}

              {ruta.map(p => (
                <div key={p.id} style={{ border: '1px solid gray', margin: 10, padding: 10 }}>
                  <p><strong>{p.orden}. {p.cliente}</strong></p>
                  <p>OV: {p.ov}</p>
                  <p>Dirección: {p.direccion}</p>
                  <p>Teléfono: {p.telefono}</p>
                  <p>Estado: {p.estado}</p>

                  {p.remito_url && (
                    <img src={p.remito_url} alt="Remito firmado" style={{ width: 180, marginTop: 10 }} />
                  )}
                </div>
              ))}
            </div>
          )
        })}

        <h3>Notificaciones disparadas</h3>
        {notificaciones.length === 0 && <p>Aún no hay notificaciones.</p>}

        {notificaciones.map((n, index) => (
          <div key={index} style={{ border: '1px solid green', margin: 10, padding: 10 }}>
            {n}
          </div>
        ))}
      </div>
    )
  }

  function vistaChofer(chofer) {
    const ruta = pedidos
      .filter(p => p.chofer_id === chofer.id)
      .sort((a, b) => a.orden - b.orden)

    return (
      <div>
        <h2>Ruta de {chofer.nombre}</h2>

        <button onClick={() => setUsuarioActivo(null)}>Volver</button>

        {ruta.length === 0 && <p>No tenés pedidos asignados.</p>}

        {ruta.map(p => (
          <div key={p.id} style={{ border: '1px solid gray', margin: 10, padding: 10 }}>
            <h3>{p.orden}. {p.cliente}</h3>
            <p><strong>OV:</strong> {p.ov}</p>
            <p><strong>Dirección:</strong> {p.direccion}</p>
            <p><strong>Teléfono:</strong> {p.telefono}</p>
            <p><strong>Estado:</strong> {p.estado}</p>

            <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.direccion)}`, '_blank')}>
              Abrir en Google Maps
            </button>

            {p.estado === 'pendiente' && (
              <>
                <br /><br />
                <button onClick={() => iniciarEntrega(p.id)}>
                  Iniciar entrega
                </button>
              </>
            )}

            {p.estado !== 'entregado' && (
              <>
                <p><strong>Foto del remito firmado:</strong></p>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => cargarRemito(p.id, e.target.files[0])}
                />

                {p.remito_url && (
                  <div>
                    <p>✅ Remito cargado</p>
                    <img src={p.remito_url} alt="Remito firmado" style={{ width: 200, marginTop: 10 }} />
                  </div>
                )}

                <br /><br />

                <button onClick={() => entregarPedido(p.id)}>
                  Entregar pedido
                </button>
              </>
            )}

            {p.estado === 'entregado' && (
              <p>✅ Pedido entregado con remito firmado</p>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (usuarioActivo === 'admin') {
    return <div style={{ padding: 20 }}><h1>🚚 Última Milla Nexina</h1>{vistaAdmin()}</div>
  }

  const choferActivo = choferes.find(c => c.id === usuarioActivo)

  if (choferActivo) {
    return <div style={{ padding: 20 }}><h1>🚚 App Chofer</h1>{vistaChofer(choferActivo)}</div>
  }
if (usuarioActivo === 'historico') {
  return (
    <div style={{ padding: 20 }}>
      <h1>📦 Histórico de Entregas</h1>

      <button onClick={() => setUsuarioActivo(null)}>
        Volver
      </button>

      <h3>Pedidos históricos: {historico.length}</h3>

      {historico.length === 0 && (
        <p>No hay pedidos históricos todavía.</p>
      )}

      {historico.map(p => (
        <div key={p.id} style={{ border: '1px solid gray', margin: 10, padding: 10 }}>
          <p><strong>OV:</strong> {p.ov}</p>
          <p><strong>Cliente:</strong> {p.cliente}</p>
          <p><strong>Dirección:</strong> {p.direccion}</p>
          <p><strong>Teléfono:</strong> {p.telefono}</p>
          <p><strong>Chofer ID:</strong> {p.chofer_id}</p>
          <p><strong>Estado:</strong> {p.estado}</p>
          <p><strong>Ruta:</strong> {p.ruta_id}</p>

          {p.remito_url ? (
            <div>
              <p>✅ Remito firmado:</p>
              <img
                src={p.remito_url}
                alt="Remito firmado"
                style={{ width: 220, marginTop: 10 }}
              />
            </div>
          ) : (
            <p>Sin remito cargado.</p>
          )}
        </div>
      ))}
    </div>
  )
}
  return (
    <div style={{ padding: 20 }}>
      <h1>🚚 Última Milla Nexina</h1>
      <h2>Ingresar como:</h2>

      <button onClick={() => setUsuarioActivo('admin')}>
        Admin / Tráfico
      </button>

      <br /><br />

<button onClick={() => {
  setUsuarioActivo('historico')
  cargarHistorico()
}}>
  Histórico de entregas
</button>

      {choferes.map(c => (
        <div key={c.id} style={{ marginBottom: 10 }}>
          <button onClick={() => setUsuarioActivo(c.id)}>
            Chofer: {c.nombre}
          </button>
        </div>
      ))}
    </div>
  )
}

export default App