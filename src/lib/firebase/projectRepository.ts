import { doc, getDoc, setDoc } from 'firebase/firestore'
import type { Project } from '../../types/music'
import { firestore } from './config'

const COLLECTION_NAME = 'projects'

export async function saveProject(project: Project): Promise<void> {
  await setDoc(doc(firestore, COLLECTION_NAME, project.id), project)
}

export async function loadProject(projectId: string): Promise<Project | null> {
  const snapshot = await getDoc(doc(firestore, COLLECTION_NAME, projectId))
  return snapshot.exists() ? (snapshot.data() as Project) : null
}
