export function getFeatureName(props: any) {
  return (
    props?.ST_NM ||
    props?.STATE ||
    props?.NAME ||
    props?.name ||
    props?.DISTRICT ||
    props?.DIST_NAME ||
    props?.DIST ||
    "Unknown"
  ).toString();
}
