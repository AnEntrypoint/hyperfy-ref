import * as THREE from 'three'

import { num } from '@/utils/num'
import { DEG2RAD } from '@/utils/general'

import { System } from './System'
import { SockClient } from './SockClient'

const SEND_RATE = 1 / 5 // 5Hz (5 times per second)

let ids = 0

export class Network extends System {
  constructor(space) {
    super(space)
    this.server = null
    this.meta = null
    this.permissions = null
    this.clients = new Map()
    this.client = null
    this.packet = {}
    this.lastSendTime = 0
    this.active = false
  }

  async init() {
    const url = `${process.env.PUBLIC_CONTROLLER_WS}/space/${this.space.id}`
    this.log('connecting', url)

    this.server = new SockClient(url)
    this.server.on('connect', this.onConnect)
    this.server.on('init', this.onInit)
    this.server.on('add-client', this.onAddClient)
    this.server.on('update-client', this.onUpdateClient)
    this.server.on('remove-client', this.onRemoveClient)
    this.server.on('upsert-schema', this.onUpsertSchema)
    this.server.on('add-entity', this.onAddEntity)
    this.server.on('update-entity', this.onUpdateEntity)
    this.server.on('remove-entity', this.onRemoveEntity)
    this.server.on('disconnect', this.onDisconnect)

    this.space.on('auth-change', this.updateClient)
  }

  update(delta) {
    this.server.flush()
    this.lastSendTime += delta
    if (this.lastSendTime >= SEND_RATE) {
      if (Object.keys(this.packet).length) {
        this.server.send('packet', this.packet)
        this.packet = {}
      }
      this.lastSendTime = 0
    }
  }

  makeId() {
    return `${this.client.id}.${++ids}`
  }

  onConnect = () => {
    this.log('connect')
    this.space.emit('connect')
    this.server.send('auth', this.space.auth.token)
  }

  onInit = async data => {
    this.log('init', data)
    this.meta = data.meta
    this.permissions = data.permissions
    for (const clientData of data.clients) {
      const client = new Client().deserialize(clientData)
      this.clients.set(client.id, client)
    }
    const client = this.clients.get(data.clientId)
    this.client = client
    for (const schema of data.schemas) {
      this.space.entities.upsertSchema(schema)
    }
    for (const entity of data.instances) {
      this.space.entities.addInstance(entity)
    }

    // TODO: preload stuff and get it going
    // await this.space.loader.preload()
    // const place = this.space.items.findPlace('spawn')
    // this.space.avatars.spawn(place)
    // await this.server.call('auth', this.space.token)

    this.active = true
    this.space.emit('active')

    this.updateClient()

    // const avatar = this.space.entities.addInstanceLocal({
    //   id: this.makeId(),
    //   type: 'avatar',
    //   creator: this.client.user.id,
    //   authority: client.id,
    //   active: true,
    //   position: [0, 1, 0],
    //   quaternion: [0, 0, 0, 1],
    //   state: {
    //     position: [num(-1, 1, 2), 2, 0],
    //     quaternion: [0, 0, 0, 1],
    //   },
    //   nodes: [
    //     {
    //       type: 'script',
    //       name: 'my-script',
    //       code: AVATAR_SCRIPT,
    //     },
    //   ],
    // })

    this.avatar = this.space.entities.addInstanceLocal({
      id: this.makeId(),
      schemaId: '$avatar',
      creator: this.client.user.id,
      authority: client.id,
      mode: 'active',
      modeClientId: null,
      position: [num(-1, 1, 2), 1, 0],
      quaternion: new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, 0 * DEG2RAD, 0, 'YXZ'))
        .toArray(),
      state: {},
    })
  }

  pushSchema(schema) {
    if (!this.packet.schemas) {
      this.packet.schemas = {}
    }
    this.packet.schemas[schema.id] = schema
  }

  pushEntityUpdate(id, fn) {
    if (!this.packet.entities) {
      this.packet.entities = {}
    }
    if (!this.packet.entities[id]) {
      this.packet.entities[id] = {}
    }
    fn(this.packet.entities[id])
  }

  updateClient = () => {
    if (!this.active) return
    const user = this.space.auth.user
    const client = this.client
    client.name = user.name
    client.address = user.address
    this.server.send('update-client', client.serialize())
  }

  findUser(userId) {
    for (const client of this.clients.values()) {
      if (client.user.id === userId) return client.user
    }
  }

  onAddClient = data => {
    this.log('add-client', data)
    const client = new Client().deserialize(data)
    this.clients.set(client.id, client)
  }

  onUpdateClient = data => {
    this.log('update-client', data)
    const client = this.clients.get(data.id)
    client.deserialize(data)
  }

  onRemoveClient = id => {
    this.log('remove-client', id)
    this.clients.delete(id)
  }

  onUpsertSchema = schema => {
    this.space.entities.upsertSchema(schema)
  }

  onAddEntity = data => {
    this.log('add-entity', data)
    this.space.entities.addInstance(data)
  }

  onUpdateEntity = data => {
    // this.log('update-entity', data)
    const entity = this.space.entities.getInstance(data.id)
    if (data.state) {
      entity.onRemoteStateChanges(data.state)
    }
    if (data.props) {
      entity.onRemotePropChanges(data.props)
    }
  }

  onRemoveEntity = id => {
    this.log('remove-entity', id)
    this.space.entities.removeInstance(id)
  }

  onDisconnect = () => {
    this.log('disconnect')
    this.space.emit('disconnect')
  }

  log(...args) {
    console.log('[network]', ...args)
  }

  destroy() {
    this.server.disconnect()
  }
}

class Client {
  constructor() {
    this.id = null
    this.user = null
    this.permissions = null
  }

  deserialize(data) {
    this.id = data.id
    this.user = data.user
    this.permissions = data.permissions
    return this
  }

  serialize() {
    return {
      id: this.id,
      user: this.user,
      permissions: this.permissions,
    }
  }
}

// const AVATAR_SCRIPT = `
// (function() {
//   return entity => {
//     return class Script {
//       init() {
//         const state = entity.getState()
//         const authority = entity.isAuthority()
//         console.log('state.position', state.position)
//         console.log('authority', authority)
//         this.box = entity.create({
//           type: 'box',
//           name: 'box',
//           position: state.position,
//         })
//         entity.add(this.box)
//       }
//       start() {
//         console.log('state pos', this.box.position)
//       }
//       update(delta) {

//       }
//       onState(newState) {

//       }
//     }
//   }
// })()
// `
