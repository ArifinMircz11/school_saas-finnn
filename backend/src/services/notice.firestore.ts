import { firestore } from '../config/firestore';

export const noticeFirestore = {
  async findMany(schoolId: string) {
    try {
      if (!firestore) throw new Error('Firestore not initialized');
      const snapshot = await firestore
        .collection('schools')
        .doc(schoolId)
        .collection('notices')
        .orderBy('createdAt', 'desc')
        .get();
      return snapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
        };
      });
    } catch (e) {
      console.warn('⚠️ Firestore notices findMany fallback to Prisma:', e);
      return null;
    }
  },

  async create(schoolId: string, data: { title: string; content: string; audience: string }) {
    try {
      if (!firestore) throw new Error('Firestore not initialized');
      const noticeData = {
        schoolId,
        title: data.title,
        content: data.content,
        audience: data.audience || 'ALL',
        createdAt: new Date(),
      };
      const docRef = await firestore
        .collection('schools')
        .doc(schoolId)
        .collection('notices')
        .add(noticeData);
      return { id: docRef.id, ...noticeData };
    } catch (e) {
      console.warn('⚠️ Firestore notices create fallback to Prisma:', e);
      return null;
    }
  },
};
