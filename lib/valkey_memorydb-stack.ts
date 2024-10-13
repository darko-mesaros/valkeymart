import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as memorydb from 'aws-cdk-lib/aws-memorydb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import path = require('path');
import {readFileSync} from 'fs';


export class ValkeyMemorydbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // vpc
    const vpc = new ec2.Vpc(this, 'valkeyVpc',{
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/21'),
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'Public',
          cidrMask: 24,
        }
      ]
    });

    // Security Group
    const valkeySecurtyGroup = new ec2.SecurityGroup(this, 'valkeySecurtyGroup',
      { 
        vpc,
        allowAllOutbound: true,
      });

    valkeySecurtyGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(6379)
    );

    // Valkey-CLI host
    // SSM Role
    const ssmRole = new iam.Role(this, "SSMRole",{
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    ssmRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // EC2 Instance
    const valkeyClientHost = new ec2.Instance(this, 'valkeyClientHost',{
      vpc,
      role: ssmRole,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64
      })
    });
    const userDataScript = readFileSync('./assets/user-data.sh', 'utf8');
    valkeyClientHost.addUserData(userDataScript);
    // SSM session manager command
    new cdk.CfnOutput(this, 'ssmSessionManagerCommand',{
      description: "Session Manager Command",
      value: 'aws ssm start-session --target '+valkeyClientHost.instanceId
    });

    // MemoryDB
    // SubnetGroup
    const selectedSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });
    const valkeySubnetGroup = new memorydb.CfnSubnetGroup(this, 'valkeySubnetGroup',{
      subnetGroupName: 'valkey-subnet-group',
      subnetIds: selectedSubnets.subnetIds,
    });
    
    // Manually managing dependencies - just in case
    valkeySubnetGroup.node.addDependency(vpc);
    
    // Cluster
    // 🔴 This takes a LONG time to launch 🔴
    const valkeyCluster = new memorydb.CfnCluster(this, 'valkeyCluster',{
      clusterName: 'valkey-demo-cluster',
      aclName: 'open-access',
      parameterGroupName: 'default.memorydb-redis7', // CHANGE THIS TO default.memorydb-valkey7 FOR VALKEY
      nodeType: 'db.t4g.small',
      numShards: 1,
      numReplicasPerShard: 1,
      // Most likely there will be a 'engine' parameter here
      engineVersion: '7.1', // CHANGE THIS TO 7.2 FOR VALKEY
      port: 6379,
      tlsEnabled: true,
      subnetGroupName: valkeySubnetGroup.subnetGroupName,
      securityGroupIds: [
        valkeySecurtyGroup.securityGroupId
      ]
    });
    
    // Manually managing dependencies - just in case
    valkeyCluster.node.addDependency(valkeySubnetGroup);
    valkeyCluster.node.addDependency(valkeySecurtyGroup);

    // AppRunner 
    const valkeyMartVpcConnector = new apprunner.VpcConnector(this, 'valkeyMartVpcConnector', {
      vpc,
      vpcSubnets: vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}),
      vpcConnectorName: 'valkeyMartVpcConnector'
    });
    const valkeyMartAsset = new assets.DockerImageAsset(this, 'valkeyMartAsset', {
      directory: path.join(__dirname, '../assets/valkeymart')
    });
    const valkeyMart = new apprunner.Service(this, 'valkeyMart', {
      vpcConnector: valkeyMartVpcConnector,
      source: apprunner.Source.fromAsset({
        asset: valkeyMartAsset,
        imageConfiguration: {
          port: 5000,
          environmentVariables: {
            REDIS_URL: valkeyCluster.attrClusterEndpointAddress.toString(),
            // TODO: Need to fix the REDIS_PORT. As by default CDK creates a Fn::GetAtt to the ClusterEndpoint.Port Value
            // which will always be an integer. Not really sure how to fix this.
            //
            //REDIS_PORT: cdk.Token.asString(valkeyCluster.attrClusterEndpointPort),
            SSL: 'True',
            LOCAL: 'False',
          }
        }
      })

    });

    // Outputs
    // App Runner Endpint URL
    new cdk.CfnOutput(this, 'apprunnerEndpoint',{
      description: "App Runner Endpoint URL",
      value: 'https://'+valkeyMart.serviceUrl
    });

    // Valkey DB endpoint
    new cdk.CfnOutput(this, 'memoryDBEndpoint',{
      description: "MemoryDB Endpoint URL",
      value: valkeyCluster.attrClusterEndpointAddress
    });

    // Valkey CLI connect command:
    // NOTE: This has the port as hardcoded
    new cdk.CfnOutput(this, 'valkeyCLIConnect',{
      description: "Valkey CLI Connection command",
      value: 'valkey-cli -h '+valkeyCluster.attrClusterEndpointAddress+' -p 6379 -c --tls'
    });


  }
}
