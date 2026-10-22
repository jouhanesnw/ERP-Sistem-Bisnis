import Denied from '@/components/Denied'
import { getPdContext,loadProduk } from '@/modules/produk/data'
import ProdukManager from '@/modules/produk/ProdukManager'
export default async function Page(){const k=await getPdContext();if(!k)return <Denied module="Produk & Stok"/>;const produk=await loadProduk(k.companyId);return <ProdukManager companyId={k.companyId} produk={produk} perm={k.perm}/>}
