import Denied from '@/components/Denied'
import { getPdContext,loadProduk } from '@/modules/produk/data'
import StokManager from '@/modules/produk/StokManager'
export default async function Page(){const k=await getPdContext();if(!k)return <Denied module="Produk & Stok"/>;const produk=await loadProduk(k.companyId);return <StokManager companyId={k.companyId} produk={produk}/>}
