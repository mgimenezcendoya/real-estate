'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function InversoresRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/proyectos/${id}/financiero`);
  }, [id, router]);
  return null;
}
