import Denied from '@/components/Denied'
import { getPdContext,loadProduk } from '@/modules/produk/data'
import PenyesuaianManager from '@/modules/produk/PenyesuaianManager'
export default async function Page(){const k=await getPdContext();if(!k)return <Denied module="Produk & Stok"/>;const produk=await loadProduk(k.companyId);return <PenyesuaianManager companyId={k.companyId} produk={produk} perm={k.perm}/>}
