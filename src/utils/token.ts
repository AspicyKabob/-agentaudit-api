import jwt from 'jsonwebtoken';
import { config } from '../config';

function getSecret(): string {
  return config.get('jwtSecret') as string;
}

function getAccessExpiry(): string {
  return config.get('jwtAccessExpiration') as string;
}

function getRefreshExpiry(): string {
  return config.get('jwtRefreshExpiration') as string;
}

export function signAccessToken(payload: object): string {
  const options = { expiresIn: getAccessExpiry() } as jwt.SignOptions;
  return jwt.sign(payload, getSecret(), options);
}

export function signRefreshToken(payload: object): string {
  const options = { expiresIn: getRefreshExpiry() } as jwt.SignOptions;
  return jwt.sign(payload, getSecret(), options);
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, getSecret()) as jwt.JwtPayload;
}
