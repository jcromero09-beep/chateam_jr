import { useCallback, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FloppyDisk,
  Play,
  ChatText,
  ListBullets,
  Microphone,
  VideoCamera,
  Image as ImageIcon,
  FilePdf,
  SquaresFour,
  Tray,
  Tag as TagIcon,
  CalendarCheck,
} from '@phosphor-icons/react'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'
import { toast } from 'react-toastify'

// Import node types
// @ts-ignore
import messageNode from './FlowBuilder/nodes/messageNode.jsx'
// @ts-ignore
import startNode from './FlowBuilder/nodes/startNode.jsx'
// @ts-ignore
import menuNode from './FlowBuilder/nodes/menuNode.jsx'
// @ts-ignore
import singleBlockNode from './FlowBuilder/nodes/singleBlockNode.jsx'
// @ts-ignore
import citasNode from './FlowBuilder/nodes/citasNode.jsx'

const nodeTypes = {
  message: messageNode,
  start: startNode,
  menu: menuNode,
  // singleBlock: nodo agrupador (mensajes secuenciales). Lo usa el flujo demo
  // generado al crear empresa nueva, y se mantiene como tipo legacy soportado.
  singleBlock: singleBlockNode,
  citas: citasNode,
}

// Import modals
// @ts-ignore
import FlowBuilderAddTextModal from '../components/FlowBuilderAddTextModal'
// @ts-ignore
import FlowBuilderMenuModal from '../components/FlowBuilderMenuModal'
// @ts-ignore
import FlowBuilderSingleBlockModal from '../components/FlowBuilderSingleBlockModal'
// @ts-ignore
import FlowBuilderAddPdfModal from '../components/FlowBuilderAddPdfModal'
// @ts-ignore
import FlowBuilderAddImgModal from '../components/FlowBuilderAddImgModal'
// @ts-ignore
import FlowBuilderAddAudioModal from '../components/FlowBuilderAddAudioModal'
// @ts-ignore
import FlowBuilderAddVideoModal from '../components/FlowBuilderAddVideoModal'
// @ts-ignore
import FlowBuilderAddURLModal from '../components/FlowBuilderAddURLModal'
// @ts-ignore
import FlowBuilderAddListModal from '../components/FlowBuilderAddListModal'
// @ts-ignore
import FlowBuilderRandomizerModal from '../components/FlowBuilderRandomizerModal'
// @ts-ignore
import FlowBuilderIntervalModal from '../components/FlowBuilderIntervalModal'
// @ts-ignore
import FlowBuilderCitasModal from '../components/FlowBuilderCitasModal'

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'start',
    data: { label: 'Inicio del flujo' },
    position: { x: 250, y: 25 },
  },
]

const initialEdges: Edge[] = []

export default function FlowbuilderEditor() {
  const { flowId } = useParams()
  const navigate = useNavigate()
  const [flowName, setFlowName] = useState('Cargando...')
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [loading, setLoading] = useState(true)

  // Modal states
  const [modalAddText, setModalAddText] = useState<string | null>(null)
  const [modalAddMenu, setModalAddMenu] = useState<string | null>(null)
  const [modalAddImage, setModalAddImage] = useState<string | null>(null)
  const [modalAddAudio, setModalAddAudio] = useState<string | null>(null)
  const [modalAddVideo, setModalAddVideo] = useState<string | null>(null)
  const [modalAddURL, setModalAddURL] = useState<string | null>(null)
  const [modalAddList, setModalAddList] = useState<string | null>(null)
  const [modalAddPDF, setModalAddPDF] = useState<string | null>(null)
  const [modalSingleBlock, setModalSingleBlock] = useState<string | null>(null)
  const [modalRandomizer, setModalRandomizer] = useState<string | null>(null)
  const [modalInterval, setModalInterval] = useState<string | null>(null)
  const [modalCitas, setModalCitas] = useState<string | null>(null)
  const [modalQueue, setModalQueue] = useState<string | null>(null)
  const [modalTag, setModalTag] = useState<string | null>(null)
  const [dataNode, setDataNode] = useState<any>(null)
  // dataNode se usa para pasar datos al modal en modo edición
  void dataNode

  // Datos para selectores de cola y etiqueta
  const [queues, setQueues] = useState<{ id: number; name: string; color: string }[]>([])
  const [tags, setTags] = useState<{ id: number; name: string; color: string; kanban: number }[]>([])
  const [selectedQueueId, setSelectedQueueId] = useState<string>('')
  const [selectedTagId, setSelectedTagId] = useState<string>('')

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [qRes, tRes] = await Promise.all([
          api.get('/queue'),
          api.get('/tags/list', { params: { kanban: 0 } })
        ])
        setQueues((qRes.data || []).map((q: any) => ({ id: q.id, name: q.name, color: q.color })))
        const tagList = Array.isArray(tRes.data) ? tRes.data : (tRes.data?.tags || [])
        setTags(tagList.filter((t: any) => !t.kanban || t.kanban === 0).map((t: any) => ({ id: t.id, name: t.name, color: t.color, kanban: t.kanban || 0 })))
      } catch (err) {
        console.error('Error cargando colas/etiquetas:', err)
      }
    }
    loadOptions()
  }, [])

  useEffect(() => {
    if (flowId) {
      loadFlow()
    }
  }, [flowId])

  const loadFlow = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/flowbuilder/${flowId}`)
      const flow = response.data

      setFlowName(flow.name)

      // Cargar nodos y conexiones del flujo
      const flowDataResponse = await api.get(`/flowbuilder/flow/${flowId}`)
      const flowData = flowDataResponse.data

      if (flowData.nodes && flowData.nodes.length > 0) {
        setNodes(flowData.nodes)
      }

      if (flowData.connections && flowData.connections.length > 0) {
        setEdges(flowData.connections)
      }

      console.log('✅ Flujo cargado:', flow)
    } catch (error) {
      console.error('❌ Error al cargar flujo:', error)
      toast.error('Error al cargar el flujo')
    } finally {
      setLoading(false)
    }
  }

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const handleSave = async () => {
    try {
      await api.post('/flowbuilder/flow', {
        idFlow: flowId,
        nodes,
        connections: edges,
      })
      toast.success('Flujo guardado correctamente')
    } catch (error: any) {
      console.error('Error al guardar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al guardar el flujo')
    }
  }

  const addTextNode = () => {
    setModalAddText("create")
  }

  const addMenuNode = () => {
    setModalAddMenu("create")
  }

  const addImageNode = () => {
    setModalAddImage("create")
  }

  const addAudioNode = () => {
    setModalAddAudio("create")
  }

  const addVideoNode = () => {
    setModalAddVideo("create")
  }

  const _addURLNode = () => {
    setModalAddURL("create")
  }

  const _addListNode = () => {
    setModalAddList("create")
  }

  const addPDFNode = () => {
    setModalAddPDF("create")
  }

  const addContentNode = () => {
    setModalSingleBlock("create")
  }

  const addRandomizerNode = () => {
    setModalRandomizer("create")
  }

  const addIntervalNode = () => {
    setModalInterval("create")
  }

  const addCitasNode = () => {
    setModalCitas("create")
  }

  const addQueueNode = () => {
    setSelectedQueueId('')
    setModalQueue("create")
  }

  const addTagNode = () => {
    setSelectedTagId('')
    setModalTag("create")
  }

  const handleSaveQueueNode = () => {
    if (!selectedQueueId) return
    const queue = queues.find(q => q.id === Number(selectedQueueId))
    if (!queue) return
    const posY = nodes[nodes.length - 1]?.position.y || 100
    const posX = (nodes[nodes.length - 1]?.position.x || 100) + 240
    setNodes((old) => [
      ...old,
      {
        id: `node-${Date.now()}`,
        position: { x: posX, y: posY },
        data: { id: queue.id, queueName: queue.name, type: 'ticket' },
        type: 'message',
      },
    ])
    setModalQueue(null)
    setSelectedQueueId('')
  }

  const handleSaveTagNode = () => {
    if (!selectedTagId) return
    const tag = tags.find(t => t.id === Number(selectedTagId))
    if (!tag) return
    const posY = nodes[nodes.length - 1]?.position.y || 100
    const posX = (nodes[nodes.length - 1]?.position.x || 100) + 240
    setNodes((old) => [
      ...old,
      {
        id: `node-${Date.now()}`,
        position: { x: posX, y: posY },
        data: { id: tag.id, tagName: tag.name, tagColor: tag.color, type: 'tag' },
        type: 'message',
      },
    ])
    setModalTag(null)
    setSelectedTagId('')
  }

  const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
    // No permitir editar el nodo de inicio
    if (node.type === 'start') return

    setDataNode(node)
    // data.type tiene prioridad (nodos multimedia/cola/tag se guardan como type:"message" con data.type real)
    const nodeType = node.data?.type || node.type
    switch (nodeType) {
      case 'message':
        setModalAddText("edit")
        break
      case 'ticket':
        setSelectedQueueId(String(node.data?.id || ''))
        setModalQueue("edit")
        break
      case 'tag':
        setSelectedTagId(String(node.data?.id || ''))
        setModalTag("edit")
        break
      case 'menu':
        setModalAddMenu("edit")
        break
      case 'image':
        setModalAddImage("edit")
        break
      case 'audio':
        setModalAddAudio("edit")
        break
      case 'video':
        setModalAddVideo("edit")
        break
      case 'url':
        setModalAddURL("edit")
        break
      case 'list':
        setModalAddList("edit")
        break
      case 'pdf':
        setModalAddPDF("edit")
        break
      case 'content':
        setModalSingleBlock("edit")
        break
      case 'randomizer':
        setModalRandomizer("edit")
        break
      case 'interval':
        setModalInterval("edit")
        break
      case 'citas':
        setModalCitas("edit")
        break
      default:
        console.warn('Tipo de nodo no reconocido para edición:', nodeType)
    }
  }

  const textAdd = (data: any) => {
    const posY = nodes[nodes.length - 1].position.y;
    const posX = nodes[nodes.length - 1].position.x + 240;
    setNodes((old) => [
      ...old,
      {
        id: `node-${Date.now()}`,
        position: { x: posX, y: posY },
        data: { label: data.text },
        type: "message",
      },
    ]);
  };

  const menuAdd = (data: any) => {
    const posY = nodes[nodes.length - 1].position.y;
    const posX = nodes[nodes.length - 1].position.x + 240;
    setNodes((old) => [
      ...old,
      {
        id: `node-${Date.now()}`,
        position: { x: posX, y: posY },
        data: {
          message: data.message,
          arrayOption: data.arrayOption,
        },
        type: "menu",
      },
    ]);
  };

  const citasAdd = (data: any) => {
    const posY = nodes[nodes.length - 1].position.y;
    const posX = nodes[nodes.length - 1].position.x + 240;
    setNodes((old) => [
      ...old,
      {
        id: `node-${Date.now()}`,
        position: { x: posX, y: posY },
        data: { ...data, type: "citas" },
        type: "citas",
      },
    ]);
  };

  const mediaAdd = (data: any, type: string) => {
    const posY = nodes[nodes.length - 1].position.y;
    const posX = nodes[nodes.length - 1].position.x + 240;
    setNodes((old) => [
      ...old,
      {
        id: `node-${Date.now()}`,
        position: { x: posX, y: posY },
        data: {
          ...data,
          type: type
        },
        type: "message",
      },
    ]);
  };

  const updateNode = (dataAlter: any) => {
    setNodes((old) =>
      old.map((itemNode) => {
        if (itemNode.id === dataAlter.id) {
          return dataAlter;
        }
        return itemNode;
      })
    );
    setModalAddText(null);
    setModalAddMenu(null);
    setModalAddImage(null);
    setModalAddAudio(null);
    setModalAddVideo(null);
    setModalAddURL(null);
    setModalAddList(null);
    setModalAddPDF(null);
    setModalSingleBlock(null);
    setModalRandomizer(null);
    setModalInterval(null);
    setModalQueue(null);
    setModalTag(null);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Volver"
              className="text-muted-foreground"
              onClick={() => navigate('/flowbuilder/conversation')}
            >
              <ArrowLeft className="size-5" aria-hidden />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {flowName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Editor de flujo de conversación
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Play className="size-4" aria-hidden />
              Probar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>
              <FloppyDisk className="size-4" aria-hidden />
              Guardar
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={addTextNode} className="rounded-full font-semibold">
              <ChatText className="size-4" aria-hidden />
              Mensaje de Texto
            </Button>
            <Button size="sm" onClick={addMenuNode} className="rounded-full font-semibold">
              <ListBullets className="size-4" aria-hidden />
              Menú
            </Button>
            <Button size="sm" onClick={addAudioNode} className="rounded-full font-semibold">
              <Microphone className="size-4" aria-hidden />
              Audio
            </Button>
            <Button size="sm" onClick={addVideoNode} className="rounded-full font-semibold">
              <VideoCamera className="size-4" aria-hidden />
              Video
            </Button>
            <Button size="sm" onClick={addImageNode} className="rounded-full font-semibold">
              <ImageIcon className="size-4" aria-hidden />
              Imagen
            </Button>
            <Button size="sm" onClick={addPDFNode} className="rounded-full font-semibold">
              <FilePdf className="size-4" aria-hidden />
              PDF
            </Button>
            <Button size="sm" onClick={addContentNode} className="rounded-full font-semibold">
              <SquaresFour className="size-4" aria-hidden />
              Contenido
            </Button>
            <Button size="sm" onClick={addRandomizerNode} className="rounded-full font-semibold">
              Randomizador
            </Button>
            <Button size="sm" onClick={addIntervalNode} className="rounded-full font-semibold">
              Intervalo
            </Button>
            <Button size="sm" onClick={addQueueNode} className="rounded-full font-semibold">
              <Tray className="size-4" aria-hidden />
              Cola
            </Button>
            <Button size="sm" onClick={addTagNode} className="rounded-full font-semibold">
              <TagIcon className="size-4" aria-hidden />
              Etiqueta
            </Button>
            <Button size="sm" onClick={addCitasNode} className="rounded-full font-semibold">
              <CalendarCheck className="size-4" aria-hidden />
              Citas
            </Button>
          </div>
        </div>

        {/* Flow Editor */}
        <div className="h-[calc(100vh-280px)] overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={handleNodeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>

        {/* Instructions */}
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">
            💡 Instrucciones:
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            • Arrastra los nodos para organizarlos
            <br />
            • Conecta nodos arrastrando desde un punto de conexión a otro
            <br />
            • Haz doble clic en un nodo para editarlo
            <br />
            • No olvides guardar tu flujo antes de salir
          </p>
        </div>

        {/* Modals */}
        <FlowBuilderAddTextModal
          open={modalAddText}
          onSave={textAdd}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddText}
        />
        <FlowBuilderMenuModal
          open={modalAddMenu}
          onSave={menuAdd}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddMenu}
        />
        <FlowBuilderAddImgModal
          open={modalAddImage}
          onSave={(data: any) => mediaAdd(data, 'image')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddImage}
        />
        <FlowBuilderAddAudioModal
          open={modalAddAudio}
          onSave={(data: any) => mediaAdd(data, 'audio')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddAudio}
        />
        <FlowBuilderAddVideoModal
          open={modalAddVideo}
          onSave={(data: any) => mediaAdd(data, 'video')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddVideo}
        />
        <FlowBuilderAddURLModal
          open={modalAddURL}
          onSave={(data: any) => mediaAdd(data, 'url')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddURL}
        />
        <FlowBuilderAddListModal
          open={modalAddList}
          onSave={(data: any) => mediaAdd(data, 'list')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddList}
        />
        <FlowBuilderAddPdfModal
          open={modalAddPDF}
          onSave={(data: any) => mediaAdd(data, 'pdf')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalAddPDF}
        />
        <FlowBuilderSingleBlockModal
          open={modalSingleBlock}
          onSave={(data: any) => mediaAdd(data, 'content')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalSingleBlock}
        />
        <FlowBuilderRandomizerModal
          open={modalRandomizer}
          onSave={(data: any) => mediaAdd(data, 'randomizer')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalRandomizer}
        />
        <FlowBuilderIntervalModal
          open={modalInterval}
          onSave={(data: any) => mediaAdd(data, 'interval')}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalInterval}
        />
        <FlowBuilderCitasModal
          open={modalCitas}
          onSave={citasAdd}
          data={dataNode}
          onUpdate={updateNode}
          close={setModalCitas}
        />

        {/* Modal Cola */}
        <Dialog open={!!modalQueue} onOpenChange={(open) => { if (!open) setModalQueue(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {modalQueue === 'edit' ? 'Editar Nodo Cola' : 'Asignar a Cola'}
              </DialogTitle>
              <DialogDescription>
                Cuando el flujo llegue a este nodo, el ticket se asignara a la cola seleccionada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="queue-select">Cola</Label>
              <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                <SelectTrigger id="queue-select">
                  <SelectValue placeholder="Selecciona una cola..." />
                </SelectTrigger>
                <SelectContent>
                  {queues.map(q => (
                    <SelectItem key={q.id} value={String(q.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: q.color || '#ccc' }}
                          aria-hidden
                        />
                        {q.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setModalQueue(null)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!selectedQueueId}
                onClick={() => {
                  if (modalQueue === 'edit' && dataNode) {
                    const queue = queues.find(q => q.id === Number(selectedQueueId))
                    updateNode({ ...dataNode, data: { ...dataNode.data, id: Number(selectedQueueId), queueName: queue?.name || '', type: 'ticket' } })
                  } else {
                    handleSaveQueueNode()
                  }
                }}
              >
                {modalQueue === 'edit' ? 'Guardar' : 'Agregar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Etiqueta */}
        <Dialog open={!!modalTag} onOpenChange={(open) => { if (!open) setModalTag(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {modalTag === 'edit' ? 'Editar Nodo Etiqueta' : 'Asignar Etiqueta'}
              </DialogTitle>
              <DialogDescription>
                Cuando el flujo llegue a este nodo, se asignara la etiqueta al ticket automaticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="tag-select">Etiqueta (solo normales, no kanban)</Label>
              <Select value={selectedTagId} onValueChange={setSelectedTagId}>
                <SelectTrigger id="tag-select">
                  <SelectValue placeholder="Selecciona una etiqueta..." />
                </SelectTrigger>
                <SelectContent>
                  {tags.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: t.color || '#ccc' }}
                          aria-hidden
                        />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setModalTag(null)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!selectedTagId}
                onClick={() => {
                  if (modalTag === 'edit' && dataNode) {
                    const tag = tags.find(t => t.id === Number(selectedTagId))
                    updateNode({ ...dataNode, data: { ...dataNode.data, id: Number(selectedTagId), tagName: tag?.name || '', tagColor: tag?.color || '', type: 'tag' } })
                  } else {
                    handleSaveTagNode()
                  }
                }}
              >
                {modalTag === 'edit' ? 'Guardar' : 'Agregar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
