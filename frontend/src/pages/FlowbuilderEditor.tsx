import { useCallback, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Typography,
  Stack,
  Container,
  Box,
  Button,
  IconButton,
  Card,
  CardContent,
} from '@mui/joy'
import {
  ArrowBack as BackIcon,
  Save as SaveIcon,
  PlayArrow as PlayIcon,
  Message,
  MicNone,
  Videocam,
  DynamicFeed,
  Image,
  PictureAsPdf,
  Dashboard,
} from '@mui/icons-material'
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
import api from '../services/api'
import { toast } from 'react-toastify'

// Import node types
// @ts-ignore
import messageNode from './FlowBuilder/nodes/messageNode.jsx'
// @ts-ignore
import startNode from './FlowBuilder/nodes/startNode.jsx'
// @ts-ignore
import menuNode from './FlowBuilder/nodes/menuNode.jsx'

const nodeTypes = {
  message: messageNode,
  start: startNode,
  menu: menuNode,
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
  const [dataNode, _setDataNode] = useState<any>(null)
  // Suppress unused warning for dataNode
  void dataNode

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
  };

  return (
    <Container maxWidth="xl">
      <Stack spacing={2}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <IconButton onClick={() => navigate('/flowbuilder/conversation')}>
              <BackIcon />
            </IconButton>
            <Box>
              <Typography level="h2">{flowName}</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Editor de flujo de conversación
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<PlayIcon />}
              disabled
            >
              Probar
            </Button>
            <Button
              startDecorator={<SaveIcon />}
              onClick={handleSave}
              disabled={loading}
            >
              Guardar
            </Button>
          </Stack>
        </Stack>

        {/* Toolbar */}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="sm" onClick={addTextNode} startDecorator={<Message />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Mensaje de Texto
              </Button>
              <Button size="sm" onClick={addMenuNode} startDecorator={<DynamicFeed />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Menú
              </Button>
              <Button size="sm" onClick={addAudioNode} startDecorator={<MicNone />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Audio
              </Button>
              <Button size="sm" onClick={addVideoNode} startDecorator={<Videocam />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Video
              </Button>
              <Button size="sm" onClick={addImageNode} startDecorator={<Image />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Imagen
              </Button>
              <Button size="sm" onClick={addPDFNode} startDecorator={<PictureAsPdf />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + PDF
              </Button>
              <Button size="sm" onClick={addContentNode} startDecorator={<Dashboard />} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Contenido
              </Button>
              <Button size="sm" onClick={addRandomizerNode} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Randomizador
              </Button>
              <Button size="sm" onClick={addIntervalNode} sx={{ borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem', px: 2 }}>
                + Intervalo
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Flow Editor */}
        <Card sx={{ height: 'calc(100vh - 280px)' }}>
          <CardContent sx={{ p: 0, height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
            >
              <Controls />
              <MiniMap />
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card variant="soft">
          <CardContent>
            <Typography level="body-sm">
              <strong>💡 Instrucciones:</strong>
            </Typography>
            <Typography level="body-xs" sx={{ mt: 0.5 }}>
              • Arrastra los nodos para organizarlos
              <br />
              • Conecta nodos arrastrando desde un punto de conexión a otro
              <br />
              • Haz doble clic en un nodo para editarlo
              <br />
              • No olvides guardar tu flujo antes de salir
            </Typography>
          </CardContent>
        </Card>

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
      </Stack>
    </Container>
  )
}
