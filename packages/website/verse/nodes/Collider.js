import * as THREE from 'three'
import { isBoolean, isNumber } from 'lodash-es'

import { Node } from './Node'

import { Layers } from '../extras/Layers'
import { geometryToPxMesh } from '../extras/geometryToPxMesh'

const defaults = {
  type: 'box',
  width: 1,
  height: 1,
  depth: 1,
  radius: 0.5,
  geometry: null,
  convex: false,
  trigger: false,
  layer: 'environment',
  staticFriction: 0.6,
  dynamicFriction: 0.6,
  restitution: 0,
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const types = ['box', 'sphere', 'custom']

const pxMeshes = {}
function getPxMesh(world, geometry, convex) {
  if (!pxMeshes[geometry.uuid]) {
    pxMeshes[geometry.uuid] = geometryToPxMesh(world, geometry, convex)
  }
  return pxMeshes[geometry.uuid]
}

export class Collider extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'collider'

    this.type = data.type || defaults.type
    this.width = isNumber(data.width) ? data.width : defaults.width
    this.height = isNumber(data.height) ? data.height : defaults.height
    this.depth = isNumber(data.depth) ? data.depth : defaults.depth
    this.radius = isNumber(data.radius) ? data.radius : defaults.radius
    this.geometry = data.geometry || defaults.geometry
    this.convex = isBoolean(data.convex) ? data.convex : defaults.convex
    this.trigger = isBoolean(data.trigger) ? data.trigger : defaults.trigger
    this.layer = data.layer || defaults.layer
    this.staticFriction = isNumber(data.staticFriction) ? data.staticFriction : defaults.staticFriction
    this.dynamicFriction = isNumber(data.dynamicFriction) ? data.dynamicFriction : defaults.dynamicFriction
    this.restitution = isNumber(data.restitution) ? data.restitution : defaults.restitution
  }

  mount() {
    let geometry
    if (this.type === 'box') {
      geometry = new PHYSX.PxBoxGeometry(this.width / 2, this.height / 2, this.depth / 2)
    } else if (this.type === 'sphere') {
      geometry = new PHYSX.PxSphereGeometry(this.radius)
    } else if (this.type === 'custom') {
      const mesh = getPxMesh(this.ctx.world, this.geometry, this.convex)
      this.matrixWorld.decompose(_v1, _q1, _v2)
      const scale = new PHYSX.PxMeshScale(new PHYSX.PxVec3(_v2.x, _v2.y, _v2.z), new PHYSX.PxQuat(0, 0, 0, 1))
      if (this.convex) {
        geometry = new PHYSX.PxConvexMeshGeometry(mesh, scale)
      } else {
        geometry = new PHYSX.PxTriangleMeshGeometry(mesh, scale)
      }
      PHYSX.destroy(scale)
    }
    const material = this.ctx.world.physics.physics.createMaterial(this.staticFriction, this.dynamicFriction, this.restitution) // prettier-ignore
    const flags = new PHYSX.PxShapeFlags()
    if (this.trigger) {
      flags.raise(PHYSX.PxShapeFlagEnum.eTRIGGER_SHAPE)
    } else {
      flags.raise(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE)
    }
    const layer = Layers[this.layer]
    const filterData = new PHYSX.PxFilterData(
      layer.group,
      layer.mask,
      PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_FOUND |
        PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_LOST |
        PHYSX.PxPairFlagEnum.eNOTIFY_CONTACT_POINTS,
      0
    )
    this.shape = this.ctx.world.physics.physics.createShape(geometry, material, true, flags)
    this.shape.setQueryFilterData(filterData)
    this.shape.setSimulationFilterData(filterData)
    // const parentWorldScale = _v2
    // this.parent.matrixWorld.decompose(_v1, _q1, parentWorldScale)
    const position = _v1.copy(this.position).multiply(this.parent.scale)
    const pose = new PHYSX.PxTransform()
    position.toPxTransform(pose)
    this.quaternion.toPxTransform(pose)
    this.shape.setLocalPose(pose)
    this.parent?.addShape?.(this.shape)
    PHYSX.destroy(geometry)
    this.needsRebuild = false
  }

  commit(didMove) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      return
    }
    if (didMove) {
      // ...
    }
  }

  unmount() {
    this.parent?.removeShape?.(this.shape)
    this.shape.release()
    this.shape = null
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.type = source.type
    this.width = source.width
    this.height = source.height
    this.depth = source.depth
    this.radius = source.radius
    this.geometry = source.geometry
    this.convex = source.convex
    this.trigger = source.trigger
    this.layer = source.layer
    this.staticFriction = source.staticFriction
    this.dynamicFriction = source.dynamicFriction
    this.restitution = source.restitution
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      let proxy = {
        get type() {
          return self.type
        },
        set type(value) {
          if (!types.includes(value)) throw new Error(`[collider] invalid type: ${value}`)
          self.type = value
          self.needsRebuild = true
          self.setDirty()
        },
        get width() {
          return self.width
        },
        set width(value) {
          self.width = value
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get height() {
          return self.height
        },
        set height(value) {
          self.height = value
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get depth() {
          return self.depth
        },
        set depth(value) {
          self.depth = value
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        setSize(width, height, depth) {
          self.width = width
          self.height = height
          self.depth = depth
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get radius() {
          return self.radius
        },
        set radius(value) {
          self.radius = value
          if (self.shape && self.type === 'sphere') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        // get geometry() {
        //   return null // TODO: handle?
        // },
        // set geometry(value) {
        //   throw new Error('[collider] cannot set geometry')
        // },
        // get convex() {
        //   return null
        // },
        // set convex(value) {
        //   // ...
        // },
        get trigger() {
          return self.trigger
        },
        set trigger(value) {
          if (self.trigger === value) return
          self.trigger = value
          if (self.shape) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get layer() {
          return self.layer
        },
        set layer(value) {
          self.layer = value
          if (self.shape) {
            // todo: we could just update the PxFilterData tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get staticFriction() {
          return self.staticFriction
        },
        set staticFriction(value) {
          self.staticFriction = value
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get dynamicFriction() {
          return self.dynamicFriction
        },
        set dynamicFriction(value) {
          self.dynamicFriction = value
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get restitution() {
          return self.restitution
        },
        set restitution(value) {
          self.restitution = value
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        setMaterial(staticFriction, dynamicFriction, restitution) {
          self.staticFriction = staticFriction
          self.dynamicFriction = dynamicFriction
          self.restitution = restitution
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy())) // inherit Node properties
      this.proxy = proxy
    }
    return this.proxy
  }
}
