export type User = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: 'member' | 'admin';
  status: 'active' | 'suspended';
  createdAt: Date;
};

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
