import { db } from "../firebase";
import { ENV } from './_core/env';

export type User = {
  openId: string;
  email: string | null;
  name: string | null;
  loginMethod: string | null;
  role: "user" | "admin" | "classificador" | "engenheiro" | "diretor";
  lastSignedIn: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export async function upsertUser(user: Partial<User> & { openId: string }): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const userRef = db.collection("users").doc(user.openId);
  const snap = await userRef.get();
  const now = new Date();

  let role = user.role;
  if (!role && user.openId === ENV.ownerOpenId) {
    role = 'admin';
  }

  const userData: any = {
    ...user,
    lastSignedIn: user.lastSignedIn ?? now,
    updatedAt: now,
  };

  // Remove undefined fields
  Object.keys(userData).forEach(key => userData[key] === undefined && delete userData[key]);

  if (!snap.exists) {
    await userRef.set({
      ...userData,
      role: role ?? "user",
      createdAt: now,
    });
  } else {
    await userRef.update(userData);
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const userRef = db.collection("users").doc(openId);
  const snap = await userRef.get();

  if (snap.exists) {
    const data = snap.data();
    if (!data) return undefined;
    return {
      openId: data.openId,
      email: data.email ?? null,
      name: data.name ?? null,
      loginMethod: data.loginMethod ?? null,
      role: data.role ?? "user",
      lastSignedIn: data.lastSignedIn?.toDate ? data.lastSignedIn.toDate() : (data.lastSignedIn ?? null),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ?? undefined),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ?? undefined),
    };
  }
  return undefined;
}
