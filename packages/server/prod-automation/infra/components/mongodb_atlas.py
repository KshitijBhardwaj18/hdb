"""MongoDB Atlas cluster provisioning and VPC peering."""

import pulumi
import pulumi_mongodbatlas as atlas
import pulumi_aws as aws
from dataclasses import dataclass
from typing import Optional


@dataclass
class MongoAtlasResult:
    """Result of MongoDB Atlas provisioning."""
    connection_string: pulumi.Output[str]
    project_id: pulumi.Output[str]


def _find_existing_project(
    atlas_provider: atlas.Provider,
    project_name: str,
) -> Optional[str]:
    """Find an existing Atlas project by name. Returns project ID or None."""
    try:
        projects = atlas.get_projects(
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        for p in projects.results:
            if p.name == project_name:
                return p.id
    except Exception:
        pass
    return None


def _find_existing_cluster(
    atlas_provider: atlas.Provider,
    project_id: str,
    cluster_name: str,
) -> Optional[str]:
    """Find an existing Atlas cluster by name. Returns cluster ID or None."""
    try:
        cluster = atlas.get_cluster(
            project_id=project_id,
            name=cluster_name,
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        return cluster.cluster_id
    except Exception:
        return None


def _find_existing_db_user(
    atlas_provider: atlas.Provider,
    project_id: str,
    username: str,
    auth_db: str = "admin",
) -> bool:
    """Check if a database user already exists."""
    try:
        atlas.get_database_user(
            project_id=project_id,
            username=username,
            auth_database_name=auth_db,
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        return True
    except Exception:
        return False


def provision_atlas_cluster(
    customer_id: str,
    mongo_config,
    vpc_id: pulumi.Input[str],
    vpc_cidr: str,
    route_table_ids: list[pulumi.Input[str]],
    node_security_group_id: pulumi.Input[str],
    aws_account_id: str,
    aws_region: str,
    aws_provider: aws.Provider,
) -> MongoAtlasResult:
    """Provision MongoDB Atlas cluster with VPC peering.

    Supports two modes:
    - 'atlas': Create new project + cluster + peering (idempotent — imports existing resources)
    - 'atlas-peering': Peer to existing project/cluster
    """

    # Configure Atlas provider
    atlas_provider = atlas.Provider(
        f"{customer_id}-atlas-provider",
        client_id=mongo_config.atlas_client_id,
        client_secret=mongo_config.atlas_client_secret,
    )

    opts = pulumi.ResourceOptions(provider=atlas_provider)

    if mongo_config.mode == "atlas":
        project_name = mongo_config.atlas_project_name or f"{customer_id}-cortex"
        cluster_name = f"{customer_id}-cortex"

        # --- Project (idempotent) ---
        existing_project_id = _find_existing_project(atlas_provider, project_name)
        if existing_project_id:
            project = atlas.Project(
                f"{customer_id}-atlas-project",
                name=project_name,
                org_id=mongo_config.atlas_org_id,
                opts=pulumi.ResourceOptions(
                    provider=atlas_provider,
                    import_=existing_project_id,
                ),
            )
        else:
            project = atlas.Project(
                f"{customer_id}-atlas-project",
                name=project_name,
                org_id=mongo_config.atlas_org_id,
                opts=opts,
            )
        project_id = project.id

        # --- Cluster (idempotent) ---
        existing_cluster_id = (
            _find_existing_cluster(atlas_provider, existing_project_id, cluster_name)
            if existing_project_id
            else None
        )
        if existing_cluster_id:
            cluster = atlas.Cluster(
                f"{customer_id}-atlas-cluster",
                project_id=project_id,
                name=cluster_name,
                provider_name="AWS",
                provider_instance_size_name=mongo_config.cluster_tier,
                provider_region_name=mongo_config.cluster_region,
                disk_size_gb=mongo_config.disk_size_gb,
                cluster_type="REPLICASET",
                opts=pulumi.ResourceOptions(
                    provider=atlas_provider,
                    import_=existing_cluster_id,
                ),
            )
        else:
            cluster = atlas.Cluster(
                f"{customer_id}-atlas-cluster",
                project_id=project_id,
                name=cluster_name,
                provider_name="AWS",
                provider_instance_size_name=mongo_config.cluster_tier,
                provider_region_name=mongo_config.cluster_region,
                disk_size_gb=mongo_config.disk_size_gb,
                cluster_type="REPLICASET",
                opts=opts,
            )

        # --- Database User (idempotent) ---
        user_exists = (
            _find_existing_db_user(atlas_provider, existing_project_id, mongo_config.db_username)
            if existing_project_id
            else False
        )
        db_user_import_id = (
            f"{existing_project_id}-{mongo_config.db_username}-admin"
            if user_exists and existing_project_id
            else None
        )
        db_user = atlas.DatabaseUser(
            f"{customer_id}-atlas-db-user",
            project_id=project_id,
            username=mongo_config.db_username,
            password=mongo_config.db_password,
            auth_database_name="admin",
            roles=[
                atlas.DatabaseUserRoleArgs(
                    role_name="readWriteAnyDatabase",
                    database_name="admin",
                ),
            ],
            opts=pulumi.ResourceOptions(
                provider=atlas_provider,
                import_=db_user_import_id,
            ) if db_user_import_id else opts,
        )

        connection_string = cluster.connection_strings.apply(
            lambda cs: cs[0].standard_srv if cs and len(cs) > 0 else ""
        )

    else:
        # atlas-peering mode: use existing project/cluster
        project_id = mongo_config.atlas_project_id

        # Look up existing cluster connection string
        existing_cluster = atlas.get_cluster(
            project_id=mongo_config.atlas_project_id,
            name=mongo_config.atlas_cluster_name,
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        connection_string = pulumi.Output.from_input(
            existing_cluster.connection_strings.private_srv
            or existing_cluster.connection_strings.standard_srv
            or ""
        )

    # --- VPC Peering ---

    atlas_region = mongo_config.cluster_region.replace("-", "_").upper()
    aws_accepter_region = aws_region

    def _get_container_id(pid: str) -> str:
        containers = atlas.get_network_containers(
            project_id=pid,
            provider_name="AWS",
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        matching = [c for c in containers.results if c.region_name == atlas_region]
        if not matching:
            raise ValueError(
                f"No Atlas network container found for region {atlas_region}. "
                "Ensure the Atlas cluster exists in this region."
            )
        return matching[0].id

    if mongo_config.mode == "atlas":
        container_id = pulumi.Output.all(cluster.id, project_id).apply(
            lambda args: _get_container_id(args[1])
        )
    else:
        container_id = _get_container_id(mongo_config.atlas_project_id)

    # Create peering from Atlas side
    peering = atlas.NetworkPeering(
        f"{customer_id}-atlas-vpc-peering",
        project_id=project_id,
        container_id=container_id,
        provider_name="AWS",
        accepter_region_name=aws_accepter_region,
        aws_account_id=aws_account_id,
        vpc_id=vpc_id,
        route_table_cidr_block=vpc_cidr,
        opts=opts,
    )

    # Accept peering on AWS side
    peering_accepter = aws.ec2.VpcPeeringConnectionAccepter(
        f"{customer_id}-atlas-peering-accepter",
        vpc_peering_connection_id=peering.connection_id,
        auto_accept=True,
        opts=pulumi.ResourceOptions(provider=aws_provider),
    )

    # Get Atlas CIDR from the peering
    atlas_cidr = peering.atlas_cidr_block

    # Add routes to Atlas CIDR in each route table
    for i, rt_id in enumerate(route_table_ids):
        aws.ec2.Route(
            f"{customer_id}-atlas-route-{i}",
            route_table_id=rt_id,
            destination_cidr_block=atlas_cidr,
            vpc_peering_connection_id=peering.connection_id,
            opts=pulumi.ResourceOptions(
                provider=aws_provider,
                depends_on=[peering_accepter],
            ),
        )

    # Allow MongoDB traffic from Atlas CIDR
    aws.ec2.SecurityGroupRule(
        f"{customer_id}-atlas-sg-rule",
        type="ingress",
        from_port=27017,
        to_port=27017,
        protocol="tcp",
        cidr_blocks=[atlas_cidr],
        security_group_id=node_security_group_id,
        description="Allow MongoDB from Atlas VPC",
        opts=pulumi.ResourceOptions(
            provider=aws_provider,
            depends_on=[peering_accepter],
        ),
    )

    # Whitelist our VPC CIDR in Atlas
    atlas.ProjectIpAccessList(
        f"{customer_id}-atlas-ip-access",
        project_id=project_id,
        cidr_block=vpc_cidr,
        comment=f"BYOC VPC {customer_id}",
        opts=opts,
    )

    # Build connection URI with credentials
    if mongo_config.mode == "atlas":
        from urllib.parse import quote_plus

        _encoded_user = quote_plus(mongo_config.db_username)
        _encoded_pass = quote_plus(mongo_config.db_password or "")

        full_uri = connection_string.apply(
            lambda cs: cs.replace(
                "mongodb+srv://",
                f"mongodb+srv://{_encoded_user}:{_encoded_pass}@",
            ) + "/admin?retryWrites=true&w=majority"
            if cs else ""
        )
    else:
        full_uri = connection_string

    return MongoAtlasResult(
        connection_string=full_uri,
        project_id=pulumi.Output.from_input(project_id),
    )
