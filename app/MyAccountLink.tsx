import Link from "next/link";

export default function MyAccountLink({className="myAccountButton"}:{className?:string}){
  return <Link className={className} href="/account">My account</Link>;
}
