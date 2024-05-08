import * as THREE from 'three'
import { isBoolean } from 'lodash-es'

import { Node } from './Node'
import { Layers } from '@/utils/Layers'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const defaults = {
  size: [1, 1, 1],
  color: 'blue',
  physics: null,
  visible: true,
}

// WIP batch mesh - has issues, eg no per-mesh layers and stuff
// const batchGroups = {} // [key] [...batches]
// const getBatch = (space, color) => {
//   const key = color
//   let group = batchGroups[key]
//   if (!group) {
//     group = []
//     batchGroups[key] = group
//   }
//   let batch = group.find(batch => batch._geometryCount < batch._maxGeometryCount)
//   if (!batch) {
//     const material = new THREE.MeshStandardMaterial({ color })
//     batch = new THREE.BatchedMesh(100, 8*100, undefined, material)
//     space.graphics.scene.add(batch)
//     group.push(batch)
//   }
//   return batch
// }

export class Box extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.size = data.size || defaults.size
    this.color = data.color || defaults.color
    this.physics = data.physics || defaults.physics
    this.visible = isBoolean(data.visible) ? data.visible : defaults.visible
  }

  mount() {
    if (this.visible) {
      const geometry = new THREE.BoxGeometry(...this.size)
      geometry.computeBoundsTree()
      const material = new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: 1,
        metalness: 0,
      })
      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.receiveShadow = true
      this.mesh.castShadow = true
      this.mesh.matrixAutoUpdate = false
      this.mesh.matrixWorldAutoUpdate = false
      this.mesh.matrix.copy(this.matrix)
      this.mesh.matrixWorld.copy(this.matrixWorld)
      this.mesh.node = this
      if (this.moving) this.mesh.layers.set(Layers.MOVING)
      this.space.graphics.scene.add(this.mesh)
    }
    if (this.physics) {
      const geometry = new PHYSX.PxBoxGeometry(
        this.size[0] / 2,
        this.size[1] / 2,
        this.size[2] / 2
      )
      const material = this.space.physics.physics.createMaterial(0.5, 0.5, 0.5)
      const flags = new PHYSX.PxShapeFlags(
        PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
          PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE
      )
      const tmpFilterData = new PHYSX.PxFilterData(1, 1, 0, 0)
      const shape = this.space.physics.physics.createShape(
        geometry,
        material,
        true,
        flags
      )
      shape.setSimulationFilterData(tmpFilterData)
      this.mesh.matrixWorld.decompose(_v1, _q1, _v2)
      const transform = new PHYSX.PxTransform()
      _v1.toPxTransform(transform)
      _q1.toPxTransform(transform)
      if (this.physics === 'dynamic') {
        this.body = this.space.physics.physics.createRigidDynamic(transform)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
      } else if (this.physics === 'kinematic') {
        this.body = this.space.physics.physics.createRigidStatic(transform)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
      } else {
        this.body = this.space.physics.physics.createRigidStatic(transform)
      }
      this.body.attachShape(shape)
      this.space.physics.scene.addActor(this.body)
      if (this.physics === 'dynamic') {
        this.unbind = this.space.physics.bind(this.body, this)
      }
    }
  }

  update() {
    if (this.mesh) {
      this.mesh.matrix.copy(this.matrixWorld)
    }
  }

  unmount() {
    if (this.mesh) {
      this.space.graphics.scene.remove(this.mesh)
    }
    if (this.body) {
      this.space.physics.scene.removeActor(this.body)
      this.unbind?.()
    }
  }

  setMoving(moving) {
    this.moving = moving
    if (this.mesh) {
      if (moving) {
        this.mesh.layers.set(Layers.MOVING)
      } else {
        this.mesh.layers.set(Layers.DEFAULT)
      }
    }
  }

  getProxy() {
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
